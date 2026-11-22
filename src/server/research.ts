/** Discovery and research services: duplicate detection, discovery runs, promotion to projects. */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { discoveries, projectCompanies, projectVentures, projects, researchSessions, sectors, sources, companies } from "@/db/schema";
import { getSearchProvider } from "@/server/ai/providers";
import { emitEvent } from "./core";
import { normalizeName, normalizeUrl, sourceFromUrl, toIsoDate } from "@/lib/normalize";

/** Possible duplicate projects for a name (trigram similarity + containment). */
export async function findDuplicateProjects(name: string, excludeId?: string) {
  const n = normalizeName(name);
  if (!n) return [];
  const rows = await db.execute(sql`select id, name, status, city, similarity(normalized_name, ${n}) as score from projects
    where (similarity(normalized_name, ${n}) > 0.35 or normalized_name = ${n} or ${n} like '%' || normalized_name || '%' or normalized_name like '%' || ${n} || '%')
    ${excludeId ? sql`and id <> ${excludeId}` : sql``}
    order by score desc limit 5`);
  return rows.rows as { id: string; name: string; status: string; city: string | null; score: number }[];
}

/** Possible duplicate discoveries (same normalised URL or very similar title). */
export async function findDuplicateDiscoveries(title: string, url: string | null, excludeId?: string) {
  const nu = normalizeUrl(url);
  const n = normalizeName(title);
  const rows = await db.execute(sql`select id, title, status, similarity(normalized_title, ${n}) as score from discoveries
    where (${nu ? sql`normalized_url = ${nu} or ` : sql``} similarity(normalized_title, ${n}) > 0.5)
    ${excludeId ? sql`and id <> ${excludeId}` : sql``} order by score desc limit 5`);
  return rows.rows as { id: string; title: string; status: string; score: number }[];
}

/** Hotels & resorts pilot: search templates the manual workflow (and automated providers) use. */
export const HOTEL_PILOT_QUERIES = [
  "new hotel announced {loc}",
  "resort development {loc} under construction",
  "hotel opening {loc} {year}",
  "branded residences hotel {loc}",
  "hotel refurbishment {loc}",
  "hotel FF&E tender {loc}",
  "hotel interior design consultant appointed {loc}",
  "hotel main contractor awarded {loc}",
];

export const PILOT_SOURCES = [
  { name: "Hotelier Middle East", domain: "hoteliermiddleeast.com" },
  { name: "Construction Week Online", domain: "constructionweekonline.com" },
  { name: "Zawya Projects", domain: "zawya.com" },
  { name: "Arabian Business", domain: "arabianbusiness.com" },
  { name: "The National", domain: "thenationalnews.com" },
  { name: "Gulf News", domain: "gulfnews.com" },
  { name: "WAM (Emirates News Agency)", domain: "wam.ae" },
  { name: "MEED", domain: "meed.com" },
  { name: "Hospitality Net", domain: "hospitalitynet.org" },
];

export function buildQueries(base: string | null, location: string | null, template: "hotels" | "custom") {
  const loc = location || "UAE";
  const year = String(new Date().getFullYear());
  if (template === "custom" || !template) return [base || `new development ${loc}`];
  const qs = HOTEL_PILOT_QUERIES.map((q) => q.replace("{loc}", loc).replace("{year}", year));
  return base ? [base, ...qs] : qs;
}

export function manualSearchLinks(query: string) {
  const enc = encodeURIComponent;
  return [
    { label: "Google News", url: `https://news.google.com/search?q=${enc(query)}` },
    { label: "Google (past year)", url: `https://www.google.com/search?q=${enc(query)}&tbs=qdr:y` },
    ...PILOT_SOURCES.slice(0, 5).map((s) => ({ label: s.name, url: `https://www.google.com/search?q=${enc(`site:${s.domain} ${query}`)}` })),
  ];
}

export async function runDiscovery(params: { title: string; query: string | null; sectorId: string | null; location: string | null; dateFrom: string | null; dateTo: string | null; template: "hotels" | "custom" }) {
  const provider = getSearchProvider();
  const queries = buildQueries(params.query, params.location, params.template);
  const [session] = await db.insert(researchSessions).values({
    kind: "discovery", title: params.title, query: queries.join("\n"), sectorId: params.sectorId, location: params.location,
    dateFrom: params.dateFrom, dateTo: params.dateTo, provider: provider?.id ?? "manual", status: provider ? "running" : "open",
  }).returning();
  let created = 0, skipped = 0, errors: string[] = [];
  if (provider) {
    for (const q of queries.slice(0, 6)) {
      try {
        const results = await provider.search(q, { maxResults: 8 });
        for (const r of results) {
          try {
            const nu = normalizeUrl(r.url);
            const dup = nu ? await db.select({ id: discoveries.id }).from(discoveries).where(eq(discoveries.normalizedUrl, nu)).limit(1) : [];
            if (dup.length) { skipped++; continue; }
            const title = (r.title || r.url).slice(0, 500);
            const [d] = await db.insert(discoveries).values({
              researchSessionId: session.id, title, normalizedTitle: normalizeName(title), summary: r.snippet?.slice(0, 4000) ?? null, url: r.url, normalizedUrl: nu,
              sourceName: r.sourceName ?? sourceFromUrl(r.url), publishedAt: toIsoDate(r.publishedAt), sectorId: params.sectorId, location: params.location, infoStatus: "reported",
            }).returning();
            await emitEvent("discovery.created", "discovery", d.id, {});
            created++;
          } catch (e) {
            errors.push(`Could not save “${(r.title || r.url).slice(0, 60)}”: ${((e as Error).message || "").split("\n")[0].slice(0, 120)}`);
          }
        }
      } catch (e) { errors.push(`Search “${q}” failed: ${((e as Error).message || "").slice(0, 160)}`); }
    }
    await db.update(researchSessions).set({ status: errors.length && !created ? "failed" : "completed",
      report: `Automated search via ${provider.label}: ${created} new result(s) saved, ${skipped} duplicate(s) skipped.${errors.length ? `\n\nIssues (${errors.length}):\n${errors.join("\n")}` : ""}`, updatedAt: new Date() }).where(eq(researchSessions.id, session.id));
  }
  return { session, provider: provider?.id ?? null, created, skipped, errors };
}

export async function saveDiscoveryAsProject(discoveryId: string, values: { name: string; ventureIds: string[]; status?: string }) {
  const [d] = await db.select().from(discoveries).where(eq(discoveries.id, discoveryId));
  if (!d) throw new Error("Discovery not found");
  let subSectorId: string | null = null;
  let sectorId = d.sectorId;
  if (sectorId) {
    const [s] = await db.select().from(sectors).where(eq(sectors.id, sectorId));
    if (s?.parentId) { subSectorId = s.id; sectorId = s.parentId; }
  }
  const [p] = await db.insert(projects).values({
    name: values.name, normalizedName: normalizeName(values.name), sectorId, subSectorId, city: d.location, brand: d.operatorName,
    description: d.summary, status: values.status ?? "new", verificationStatus: d.infoStatus === "confirmed" ? "partially_verified" : "unverified",
    researchNotes: `Created from discovery “${d.title}”.${d.developerName ? `\nDeveloper (as reported): ${d.developerName}` : ""}${d.operatorName ? `\nOperator (as reported): ${d.operatorName}` : ""}`,
  }).returning();
  if (d.url) {
    await db.insert(sources).values({ projectId: p.id, discoveryId: d.id, url: d.url, normalizedUrl: d.normalizedUrl, sourceName: d.sourceName, title: d.title,
      publishedAt: d.publishedAt, extractedInfo: d.summary, infoStatus: d.infoStatus, supportsField: "existence" });
  }
  // Link developer if a company with that name already exists
  if (d.developerName) {
    const [c] = await db.select().from(companies).where(eq(companies.normalizedName, normalizeName(d.developerName)));
    if (c) await db.insert(projectCompanies).values({ projectId: p.id, companyId: c.id, role: "developer" }).onConflictDoNothing();
  }
  for (const v of values.ventureIds) await db.insert(projectVentures).values({ projectId: p.id, ventureId: v }).onConflictDoNothing();
  await db.update(discoveries).set({ status: "saved", projectId: p.id, updatedAt: new Date() }).where(eq(discoveries.id, d.id));
  await emitEvent("project.created", "project", p.id, { fromDiscovery: d.id });
  await emitEvent("discovery.saved", "discovery", d.id, { projectId: p.id });
  return p;
}

export async function linkDiscoveryToProject(discoveryId: string, projectId: string) {
  const [d] = await db.select().from(discoveries).where(eq(discoveries.id, discoveryId));
  if (!d) throw new Error("Discovery not found");
  if (d.url) {
    await db.insert(sources).values({ projectId, discoveryId: d.id, url: d.url, normalizedUrl: d.normalizedUrl, sourceName: d.sourceName, title: d.title,
      publishedAt: d.publishedAt, extractedInfo: d.summary, infoStatus: d.infoStatus });
  }
  await db.update(discoveries).set({ status: "saved", projectId, duplicateOfProjectId: projectId, updatedAt: new Date() }).where(eq(discoveries.id, discoveryId));
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export const PROJECT_RESEARCH_CHECKLIST = [
  "What is being developed?", "Where is it located?", "Who is developing it?", "Who is operating it?",
  "Who is designing or consulting on it?", "What stage is it at?", "When was it announced?", "What is the expected timeline?",
  "What procurement or supply opportunities may exist?",
];

export const CHECKLISTS: Record<string, string[]> = {
  project: PROJECT_RESEARCH_CHECKLIST,
  company: ["What does the company do?", "Where is it based?", "Which current projects is it involved in?", "Who are its decision-makers (publicly documented)?", "Recent news?", "Relevance to each venture?"],
  announcement: ["What exactly was announced?", "Who announced it and when?", "Is it confirmed by a second source?", "Which project does it relate to?", "What changes for our opportunities?"],
  stakeholders: ["Developer / owner", "Operator / brand", "Architect", "Interior designer", "Main contractor", "Fit-out contractor", "Procurement / purchasing agent", "Project manager"],
  status: ["Current development stage", "Latest dated update", "Changes to timeline", "Changes to stakeholders"],
  procurement: ["Is there a tender or RFQ?", "Which packages?", "Who issues it?", "Deadlines?", "Pre-qualification requirements?"],
  discovery: [],
};

