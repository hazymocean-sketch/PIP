import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { normalizeName, normalizeUrl, sourceFromUrl, toIsoDate } from "@/lib/normalize";
import { getAIProvider, getSearchProvider, type SearchResult } from "./ai/providers";
import { emitEvent, notify } from "./core";

/**
 * "Go live": you are now actively working this project.
 * Marks it live, opens one deal (opportunity) per linked venture in the CRM, and leaves research to `deepResearch`.
 */
export async function goLive(projectId: string) {
  const [p] = await db.select().from(S.projects).where(eq(S.projects.id, projectId));
  if (!p) throw new Error("Project not found");
  await db.update(S.projects).set({
    isLive: true, liveSince: p.liveSince ?? new Date(),
    status: ["won", "lost", "cancelled"].includes(p.status) ? p.status : "active_opportunity", updatedAt: new Date(),
  }).where(eq(S.projects.id, projectId));

  const links = await db.select({ ventureId: S.projectVentures.ventureId, name: S.ventures.name }).from(S.projectVentures)
    .innerJoin(S.ventures, eq(S.ventures.id, S.projectVentures.ventureId)).where(eq(S.projectVentures.projectId, projectId));
  const open = await db.select().from(S.opportunities).where(and(eq(S.opportunities.projectId, projectId), notInArray(S.opportunities.commercialStatus, ["won", "lost"])));
  const created: string[] = [];
  const targets: { ventureId: string | null; name: string | null }[] = links.length ? links : (open.length ? [] : [{ ventureId: null, name: null }]);
  for (const v of targets) {
    if (open.some((o) => o.ventureId === v.ventureId)) continue;
    const [stage] = v.ventureId ? await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.ventureId, v.ventureId)).orderBy(S.pipelineStages.sortOrder).limit(1) : [];
    const [o] = await db.insert(S.opportunities).values({
      title: v.name ? `${p.name} — ${v.name}` : p.name, projectId, ventureId: v.ventureId, stageId: stage?.id ?? null,
      qualificationStatus: "qualified", commercialStatus: "open", nextAction: "Find decision-makers", isDemo: p.isDemo,
    }).returning();
    created.push(o.id);
    await emitEvent("opportunity.created", "opportunity", o.id, { fromGoLive: projectId });
  }
  return { created: created.length };
}

/** Switch "on air" off. Deals stay in the CRM (mark them won/lost there). */
export async function stopLive(projectId: string) {
  await db.update(S.projects).set({ isLive: false, updatedAt: new Date() }).where(eq(S.projects.id, projectId));
}

const ROLE_VALUES = new Set(C.PROJECT_ROLES.map((r) => r.value));
const DEV = new Set(C.DEVELOPMENT_STAGE.map((r) => r.value));
const PROC = new Set(C.PROCUREMENT_STAGE.map((r) => r.value));

type Facts = {
  developer?: string | null; main_contractor?: string | null;
  others?: { name: string; role: string }[]; development_stage?: string | null; procurement_stage?: string | null;
  expected_completion?: string | null;
};

/** Pull the first JSON object out of a model reply. */
export function parseFacts(text: string): Facts | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Facts; } catch { return null; }
}

const isReal = (v: unknown): v is string => typeof v === "string" && v.trim().length > 1 && !/^(unknown|n\/a|none|null|tbc|not (found|stated|mentioned)|-)$/i.test(v.trim());

/**
 * Deep research for one project: targeted web searches → sources attached as evidence.
 * With an AI model connected, it also reads the results and fills in only the facts that are still empty
 * (developer, main contractor, consultants & others, stage, expected completion). Everything stays "reported" until you verify it.
 */
export async function deepResearch(projectId: string) {
  const [p] = await db.select().from(S.projects).where(eq(S.projects.id, projectId));
  if (!p) throw new Error("Project not found");
  const search = getSearchProvider();
  if (p.isDemo) return finish(projectId, "failed", "Demo projects are not researched.");
  if (!search) return finish(projectId, "failed", "No search provider connected (Settings → Integrations).");
  await db.update(S.projects).set({ liveResearchStatus: "running", liveResearchAt: new Date() }).where(eq(S.projects.id, projectId));

  try {
    const where = [p.city, p.country].filter(Boolean).join(" ");
    const name = `"${p.name}"`;
    const queries = [`${name} ${where} developer main contractor`, `${name} ${where} consultant architect interior design`, `${name} ${where} completion opening date construction`];
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const q of queries) {
      try {
        for (const r of await search.search(q, { maxResults: 5 })) {
          const key = normalizeUrl(r.url) ?? r.url;
          if (!r.url || seen.has(key)) continue;
          seen.add(key); results.push(r);
        }
      } catch { /* one failed query shouldn't stop the others */ }
    }

    // Attach as evidence (skip URLs already on the project)
    const existing = new Set((await db.select({ u: S.sources.normalizedUrl }).from(S.sources).where(eq(S.sources.projectId, projectId))).map((x) => x.u));
    let added = 0;
    for (const r of results.slice(0, 10)) {
      const nu = normalizeUrl(r.url);
      if (nu && existing.has(nu)) continue;
      await db.insert(S.sources).values({
        url: r.url, normalizedUrl: nu, sourceName: r.sourceName ?? sourceFromUrl(r.url), title: r.title?.slice(0, 300) ?? null,
        publishedAt: toIsoDate(r.publishedAt), extractedInfo: r.snippet?.slice(0, 1200) ?? null, supportsField: "Go Live research", infoStatus: "reported", projectId,
      });
      added++;
    }

    // AI: read the snippets and fill empty facts
    const ai = getAIProvider();
    let filled = 0; let aiNote = "AI not connected — open the sources and fill in the facts.";
    if (ai && results.length) {
      try {
        const reply = await ai.complete(
          "You extract construction-project facts from search snippets. Use ONLY what the snippets state. If a fact is not stated, use null. Never guess. Reply with JSON only.",
          `Project: ${p.name} (${where || "location unknown"})\n\nSnippets:\n${results.slice(0, 12).map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet ?? ""}`).join("\n\n")}\n\n` +
          `Return {"developer": string|null, "main_contractor": string|null, "others": [{"name": string, "role": one of ${[...ROLE_VALUES].join("|")}}], ` +
          `"development_stage": one of ${[...DEV].join("|")} or null, "procurement_stage": one of ${[...PROC].join("|")} or null, "expected_completion": string|null (e.g. "Q3 2027", "opening 2028")}`,
          { maxTokens: 700 });
        const f = parseFacts(reply);
        if (f) filled = await applyFacts(p, f);
        aiNote = f ? `AI filled ${filled} fact${filled === 1 ? "" : "s"} — marked reported until you verify.` : "AI reply could not be read.";
      } catch (e) {
        aiNote = `AI unavailable (${String((e as Error).message).slice(0, 80)}) — open the sources and fill in the facts.`;
      }
    }
    const note = `${added} new source${added === 1 ? "" : "s"} attached from ${results.length} result${results.length === 1 ? "" : "s"}. ${aiNote}`;
    await notify(`Research ready: ${p.name}`, note, "success", `/projects/${projectId}`);
    return finish(projectId, "done", note, { added, filled });
  } catch (e) {
    return finish(projectId, "failed", `Research failed: ${String((e as Error).message).slice(0, 160)}`);
  }
}

async function finish(projectId: string, status: "done" | "failed", note: string, extra: { added?: number; filled?: number } = {}) {
  await db.update(S.projects).set({ liveResearchStatus: status, liveResearchAt: new Date(), liveResearchNote: note }).where(eq(S.projects.id, projectId));
  return { status, note, added: extra.added ?? 0, filled: extra.filled ?? 0 };
}

async function linkCompany(projectId: string, name: string, role: string) {
  const n = name.trim().slice(0, 200);
  let [c] = await db.select().from(S.companies).where(eq(S.companies.normalizedName, normalizeName(n)));
  if (!c) [c] = await db.insert(S.companies).values({ name: n, normalizedName: normalizeName(n), category: role, verificationStatus: "unverified", notes: "Found by Go Live research — verify." }).returning();
  const r = await db.insert(S.projectCompanies).values({ projectId, companyId: c.id, role, notes: "reported · Go Live research" }).onConflictDoNothing().returning();
  return r.length;
}

/** Fill only empty facts; never overwrite what you entered. */
export async function applyFacts(p: typeof S.projects.$inferSelect, f: Facts) {
  let n = 0;
  const roles = new Set((await db.select({ role: S.projectCompanies.role }).from(S.projectCompanies).where(eq(S.projectCompanies.projectId, p.id))).map((r) => r.role));
  if (isReal(f.developer) && !roles.has("developer") && !roles.has("owner")) n += await linkCompany(p.id, f.developer, "developer");
  if (isReal(f.main_contractor) && !roles.has("main_contractor")) n += await linkCompany(p.id, f.main_contractor, "main_contractor");
  for (const o of (f.others ?? []).slice(0, 6)) if (o && isReal(o.name) && ROLE_VALUES.has(o.role) && !["developer", "owner", "main_contractor"].includes(o.role)) n += await linkCompany(p.id, o.name, o.role);
  const set: Partial<typeof S.projects.$inferInsert> = {};
  if (p.developmentStage === "unknown" && f.development_stage && DEV.has(f.development_stage) && f.development_stage !== "unknown") { set.developmentStage = f.development_stage; n++; }
  if (p.procurementStage === "unknown" && f.procurement_stage && PROC.has(f.procurement_stage) && f.procurement_stage !== "unknown") { set.procurementStage = f.procurement_stage; n++; }
  if (!p.expectedCompletion && isReal(f.expected_completion)) { set.expectedCompletion = f.expected_completion.slice(0, 120); n++; }
  if (Object.keys(set).length) await db.update(S.projects).set({ ...set, updatedAt: new Date() }).where(eq(S.projects.id, p.id));
  return n;
}

/** Mark a deal won or lost (lost needs a reason). Keeps the project in sync when every deal on it is closed. */
export async function closeDeal(opportunityId: string, outcome: "won" | "lost", reason?: string | null) {
  const [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, opportunityId));
  if (!cur) throw new Error("Deal not found");
  // Move it to the venture's Won / Lost pipeline stage too, if it has one
  const stages = cur.ventureId ? await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.ventureId, cur.ventureId)) : [];
  const stage = outcome === "won" ? stages.find((s) => s.isWon) : stages.find((s) => s.isClosed && !s.isWon);
  const [o] = await db.update(S.opportunities).set({ ...(stage ? { stageId: stage.id } : {}), commercialStatus: outcome, lostReason: outcome === "lost" ? (reason ?? null) : null, closedAt: new Date(), updatedAt: new Date() })
    .where(eq(S.opportunities.id, opportunityId)).returning();
  if (!o) throw new Error("Deal not found");
  await emitEvent("opportunity.status_changed", "opportunity", o.id, { field: "commercialStatus", to: outcome, reason });
  if (o.projectId) {
    const rest = await db.select({ s: S.opportunities.commercialStatus }).from(S.opportunities).where(eq(S.opportunities.projectId, o.projectId));
    const anyOpen = rest.some((r) => !["won", "lost"].includes(r.s));
    if (!anyOpen) {
      const anyWon = rest.some((r) => r.s === "won");
      await db.update(S.projects).set({ isLive: false, status: anyWon ? "won" : "lost", updatedAt: new Date() }).where(eq(S.projects.id, o.projectId));
    }
  }
  return o;
}

/** Re-open a closed deal (in case of a mistake). */
export async function reopenDeal(opportunityId: string) {
  const [o] = await db.update(S.opportunities).set({ commercialStatus: "open", lostReason: null, closedAt: null, updatedAt: new Date() }).where(eq(S.opportunities.id, opportunityId)).returning();
  if (o?.projectId) await db.update(S.projects).set({ isLive: true, status: "active_opportunity", updatedAt: new Date() }).where(and(eq(S.projects.id, o.projectId), inArray(S.projects.status, ["won", "lost"])));
  return o;
}

export const LOST_REASONS = ["Price", "Timing / project delayed", "Went to a competitor", "Spec / product mismatch", "No response", "Project cancelled", "Other"];
