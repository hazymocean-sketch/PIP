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

/**
 * Ready-made searches per sector (keyed by the top-level sector slug). Discover uses the chosen sector's list;
 * the weekly scheduled searches use the same lists. At most 6 run per search (search credits).
 */
export const SECTOR_QUERIES: Record<string, string[]> = {
  "hotels-resorts": HOTEL_PILOT_QUERIES,
  residential: [
    "new luxury villa community launched {loc}", "branded residences project announced {loc}", "residential tower main contractor awarded {loc}",
    "apartment project construction begins {loc} {year}", "villa project handover {loc} {year}", "residential development interior design consultant {loc}",
  ],
  "office-commercial": [
    "new office tower announced {loc}", "Grade A office building under construction {loc}", "headquarters fit-out tender {loc}",
    "commercial tower main contractor awarded {loc}", "office fit-out contract awarded {loc} {year}", "business park development {loc} {year}",
  ],
  "fnb-retail-leisure": [
    "new mall announced {loc}", "retail destination under construction {loc}", "restaurant fit-out contract {loc}",
    "new restaurant opening {loc} {year}", "entertainment destination development {loc}", "retail fit-out tender {loc}",
  ],
  "education-institutional": [
    "new school campus construction {loc}", "university building contract awarded {loc}", "school project tender {loc} {year}",
    "library or cultural centre project {loc}", "institutional building interior fit-out {loc}", "education campus expansion {loc}",
  ],
  healthcare: [
    "new hospital construction {loc}", "hospital main contractor awarded {loc}", "clinic fit-out tender {loc}",
    "healthcare facility expansion {loc} {year}", "medical centre project announced {loc}", "hospital FF&E tender {loc}",
  ],
  "government-cultural": [
    "new mosque construction {loc}", "museum project contract awarded {loc}", "government building project {loc} {year}",
    "cultural centre construction {loc}", "mosque project tender {loc}", "heritage restoration project {loc}",
  ],
};
export const GENERAL_QUERIES = [
  "new project announced {loc} {year}", "main contractor awarded {loc}", "construction contract awarded {loc} {year}",
  "fit-out tender {loc}", "FF&E tender {loc}", "interior design consultant appointed {loc}",
];

/** Which list a search uses: the sector's (by slug), or "custom" = only the typed words, or the general list. Old "hotels" still works. */
export function buildQueries(base: string | null, location: string | null, template: string | null) {
  const loc = location || "UAE";
  const year = String(new Date().getFullYear());
  const fill = (qs: string[]) => qs.map((q) => q.replace("{loc}", loc).replace("{year}", year));
  const key = template === "hotels" ? "hotels-resorts" : template;
  if (key === "custom") return [base || `new development ${loc}`];
  const list = key && SECTOR_QUERIES[key] ? SECTOR_QUERIES[key] : null;
  if (!list) return base ? [/\b(uae|dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|riyadh|jeddah|doha|qatar|saudi|oman|bahrain|kuwait)\b/i.test(base) ? base : `${base} ${loc}`] : fill(GENERAL_QUERIES);
  const qs = fill(list);
  return base ? [base, ...qs] : qs;
}

/** Top-level sector slug for a sector id (a sub-sector maps to its parent). */
export async function sectorSlugFor(sectorId: string | null) {
  if (!sectorId) return null;
  const [s] = await db.select().from(sectors).where(eq(sectors.id, sectorId));
  if (!s) return null;
  if (!s.parentId) return s.slug;
  const [p] = await db.select().from(sectors).where(eq(sectors.id, s.parentId));
  return p?.slug ?? null;
}
export async function sectorIdForSlug(slug: string | null) {
  if (!slug) return null;
  const [s] = await db.select({ id: sectors.id }).from(sectors).where(eq(sectors.slug, slug === "hotels" ? "hotels-resorts" : slug));
  return s?.id ?? null;
}

export function manualSearchLinks(query: string) {
  const enc = encodeURIComponent;
  return [
    { label: "Google News", url: `https://news.google.com/search?q=${enc(query)}` },
    { label: "Google (past year)", url: `https://www.google.com/search?q=${enc(query)}&tbs=qdr:y` },
    ...PILOT_SOURCES.slice(0, 5).map((s) => ({ label: s.name, url: `https://www.google.com/search?q=${enc(`site:${s.domain} ${query}`)}` })),
  ];
}

/** template: a sector slug, "custom" (only the typed words), or null = pick from the sector (or the general list). */
type DiscoveryParams = { title: string; query: string | null; sectorId: string | null; location: string | null; dateFrom: string | null; dateTo: string | null; template?: string | null };
export const MAX_QUERIES = 6;

/** Step 1: create the session and decide which queries will run. */
export async function startDiscoverySession(params: DiscoveryParams) {
  const provider = getSearchProvider();
  const template = params.template ?? (await sectorSlugFor(params.sectorId));
  const queries = buildQueries(params.query, params.location, template).slice(0, provider ? MAX_QUERIES : 20);
  const [session] = await db.insert(researchSessions).values({
    kind: "discovery", title: params.title, query: queries.join("\n"), sectorId: params.sectorId, location: params.location,
    dateFrom: params.dateFrom, dateTo: params.dateTo, provider: provider?.id ?? "manual", status: provider ? "running" : "open",
  }).returning();
  return { session, queries, provider: provider ? { id: provider.id, label: provider.label } : null };
}

/** Step 2: run one query and save its results (duplicates skipped). */
export async function runDiscoveryQuery(sessionId: string, q: string) {
  const provider = getSearchProvider();
  const [session] = await db.select().from(researchSessions).where(eq(researchSessions.id, sessionId));
  if (!session) throw new Error("Session not found");
  let created = 0, skipped = 0; const errors: string[] = [];
  if (!provider) return { created, skipped, errors: ["No search provider connected"] };
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
          sourceName: r.sourceName ?? sourceFromUrl(r.url), publishedAt: toIsoDate(r.publishedAt), sectorId: session.sectorId, location: session.location, infoStatus: "reported",
        }).returning();
        await emitEvent("discovery.created", "discovery", d.id, {});
        created++;
      } catch (e) {
        errors.push(`Could not save “${(r.title || r.url).slice(0, 60)}”: ${((e as Error).message || "").split("\n")[0].slice(0, 120)}`);
      }
    }
  } catch (e) { errors.push(`Search “${q}” failed: ${((e as Error).message || "").slice(0, 160)}`); }
  return { created, skipped, errors };
}

/** Step 3: write the summary report and close the session. */
export async function finishDiscoverySession(sessionId: string, totals: { created: number; skipped: number; errors: string[] }) {
  const provider = getSearchProvider();
  if (!provider) return;
  await db.update(researchSessions).set({
    status: totals.errors.length && !totals.created ? "failed" : "completed",
    report: `Automated search via ${provider.label}: ${totals.created} new result(s) saved, ${totals.skipped} duplicate(s) skipped.${totals.errors.length ? `\n\nIssues (${totals.errors.length}):\n${totals.errors.join("\n")}` : ""}`,
    updatedAt: new Date(),
  }).where(eq(researchSessions.id, sessionId));
}

/** All-in-one (used by scheduled workflows and tests). */
export async function runDiscovery(params: DiscoveryParams) {
  const { session, queries, provider } = await startDiscoverySession(params);
  const totals = { created: 0, skipped: 0, errors: [] as string[] };
  if (provider) {
    for (const q of queries) {
      const r = await runDiscoveryQuery(session.id, q);
      totals.created += r.created; totals.skipped += r.skipped; totals.errors.push(...r.errors);
    }
    await finishDiscoverySession(session.id, totals);
  }
  return { session, provider: provider?.id ?? null, ...totals };
}

/** The project this name most likely already is (same name, or very similar). Used to avoid saving duplicates. */
export async function existingProjectFor(name: string) {
  const n = normalizeName(name);
  const [hit] = (await findDuplicateProjects(name)).filter((r) => normalizeName(r.name) === n || Number(r.score) >= 0.7);
  return hit ?? null;
}

/**
 * Save a discovery into the pipeline. If the project is already there (e.g. saved before for another venture),
 * the discovery is linked to it and the new venture(s) are added — one project, several ventures.
 */
export async function saveDiscoveryAsProject(discoveryId: string, values: { name: string; ventureIds: string[]; status?: string }): Promise<typeof projects.$inferSelect & { mergedInto?: boolean; addedVentures?: number }> {
  const [d] = await db.select().from(discoveries).where(eq(discoveries.id, discoveryId));
  if (!d) throw new Error("Discovery not found");
  const existing = await existingProjectFor(values.name);
  if (existing) {
    await linkDiscoveryToProject(d.id, existing.id);
    const before = (await db.select({ v: projectVentures.ventureId }).from(projectVentures).where(eq(projectVentures.projectId, existing.id))).map((r) => r.v);
    let added = 0;
    for (const v of values.ventureIds) if (!before.includes(v)) { await db.insert(projectVentures).values({ projectId: existing.id, ventureId: v }).onConflictDoNothing(); added++; }
    const [p] = await db.select().from(projects).where(eq(projects.id, existing.id));
    if (added && p.isLive) { const { goLive } = await import("./live"); await goLive(p.id); } // open deals for the new venture(s)
    return { ...p, mergedInto: true, addedVentures: added };
  }
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
  // Link reported developer / operator as stakeholder companies (created if new) so decision-makers can be looked up
  for (const [name, role] of [[d.developerName, "developer"], [d.operatorName, "operator"]] as const) {
    const n = name?.trim();
    if (!n || /^(unknown|n\/a|tbc|-)$/i.test(n)) continue;
    let [c] = await db.select().from(companies).where(eq(companies.normalizedName, normalizeName(n)));
    if (!c) [c] = await db.insert(companies).values({ name: n, normalizedName: normalizeName(n), category: role, verificationStatus: "unverified", notes: `Created from discovery “${d.title}”.` }).returning();
    await db.insert(projectCompanies).values({ projectId: p.id, companyId: c.id, role }).onConflictDoNothing();
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

