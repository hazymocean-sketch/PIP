/**
 * Demo data. Every record is fictional, prefixed "[DEMO]", flagged is_demo = true,
 * uses example.com addresses, and can be removed in one step from Settings → Data.
 * Agent and workflow activity generated while seeding is also flagged as demo.
 */
import { eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { normalizeName, normalizeUrl } from "@/lib/normalize";
import { addDays } from "./core";
import { decideApproval, startAgentRun } from "./agents/runner";
import { startWorkflowRun } from "./workflows/engine";

const DEMO_TABLES = [
  S.commandMessages, S.notifications, S.approvals, S.agentRuns, S.workflowRuns, S.workflows, S.tasks, S.activities,
  S.sources, S.newsItems, S.discoveries, S.researchSessions, S.opportunities, S.contacts, S.projects, S.companies,
] as const;

export async function purgeDemo() {
  let n = 0;
  for (const t of DEMO_TABLES) {
    const r = await db.delete(t as any).where(eq((t as any).isDemo, true)).returning({ id: (t as any).id });
    n += r.length;
  }
  return n;
}

export async function seedDemo() {
  const started = new Date(Date.now() - 1000);
  const [existing] = await db.select().from(S.projects).where(eq(S.projects.isDemo, true)).limit(1);
  if (existing) return;
  const v = Object.fromEntries((await db.select().from(S.ventures)).map((x) => [x.slug, x.id]));
  const sec = Object.fromEntries((await db.select().from(S.sectors)).map((x) => [x.slug, x.id]));

  const co = async (name: string, category: string, location: string) =>
    (await db.insert(S.companies).values({ name: `[DEMO] ${name}`, normalizedName: normalizeName(`[DEMO] ${name}`), category, location, country: "UAE", website: "https://example.com", description: "Fictional demo company.", isDemo: true }).returning())[0];
  const dev = await co("Coral Bay Developments", "developer", "Ras Al Khaimah");
  const op = await co("Saffron Hotels & Resorts", "operator", "Dubai");
  const id = await co("Atelier Noor Interiors", "interior_designer", "Dubai");
  const mc = await co("Gulfline Contracting", "main_contractor", "Abu Dhabi");

  const proj = async (vals: Partial<typeof S.projects.$inferInsert> & { name: string }) =>
    (await db.insert(S.projects).values({ ...vals, name: `[DEMO] ${vals.name}`, normalizedName: normalizeName(`[DEMO] ${vals.name}`), isDemo: true }).returning())[0];
  const p1 = await proj({ name: "Coral Bay Island Resort", projectType: "5-star beach resort", sectorId: sec["hotels-resorts"], subSectorId: sec["resort"], city: "Ras Al Khaimah",
    brand: "Saffron Resorts", status: "verified", developmentStage: "under_construction", procurementStage: "ffe_specification", roomsUnits: 320, expectedCompletion: "Q2 2028",
    announcementDate: "2026-03-10", procurementPackages: "FF&E (guestrooms, public areas), OS&E, feature lobby finishes, F&B outlet branding",
    description: "Fictional 320-key resort used to demonstrate PIP workflows.", verificationStatus: "partially_verified", opportunityScore: 74,
    scoreBreakdown: { sector_relevance: 5, project_size: 4, development_stage: 4, procurement_scope: 4, timing: 4, stakeholder_access: 2, evidence_quality: 3, commercial_fit: 3 } });
  const p2 = await proj({ name: "Marina Heights Hotel Refurbishment", projectType: "Hotel refurbishment", sectorId: sec["hotels-resorts"], subSectorId: sec["hotel-refurbishment"], city: "Dubai",
    status: "under_research", developmentStage: "planning", procurementStage: "unknown", roomsUnits: 180, description: "Fictional refurbishment demo." });
  const p3 = await proj({ name: "Desert Oasis Branded Residences", projectType: "Branded residences", sectorId: sec["hotels-resorts"], subSectorId: sec["branded-residences"], city: "Abu Dhabi",
    status: "new", developmentStage: "announced", roomsUnits: 90, description: "Fictional branded residences demo." });

  await db.insert(S.projectCompanies).values([
    { projectId: p1.id, companyId: dev.id, role: "developer" }, { projectId: p1.id, companyId: op.id, role: "operator" },
    { projectId: p1.id, companyId: id.id, role: "interior_designer" }, { projectId: p1.id, companyId: mc.id, role: "main_contractor" },
    { projectId: p2.id, companyId: op.id, role: "operator" },
  ]);
  await db.insert(S.projectVentures).values([
    { projectId: p1.id, ventureId: v.calibro, relevance: "320-key FF&E package at specification stage." },
    { projectId: p1.id, ventureId: v.moog, relevance: "Feature lobby and spa surfaces." },
    { projectId: p1.id, ventureId: v["m-studio"], relevance: "Three F&B outlets need concept branding." },
    { projectId: p2.id, ventureId: v.calibro, relevance: "Guestroom refurbishment FF&E." },
    { projectId: p3.id, ventureId: v.ffd, relevance: "Residence interiors for buyers." },
  ]);
  await db.insert(S.sources).values([
    { projectId: p1.id, url: "https://example.com/demo/coral-bay-announcement", normalizedUrl: normalizeUrl("https://example.com/demo/coral-bay-announcement"), sourceName: "Example News (demo)",
      title: "Demo: Coral Bay Island Resort announced", publishedAt: "2026-03-10", extractedInfo: "Developer and 320 keys stated in announcement.", supportsField: "developer, rooms", infoStatus: "reported", isDemo: true },
    { projectId: p1.id, sourceName: "Analyst note (demo)", extractedInfo: "Completion Q2 2028 inferred from construction start + typical duration.", supportsField: "expected completion", infoStatus: "inferred", isDemo: true },
  ]);

  const [c1] = await db.insert(S.contacts).values({ fullName: "[DEMO] Layla Haddad", position: "Head of Procurement", companyId: dev.id, email: "layla.demo@example.com",
    relationshipStatus: "identified", contactSource: "Fictional demo contact", isDemo: true }).returning();
  await db.insert(S.contacts).values({ fullName: "[DEMO] Omar Rahman", position: "Design Director", companyId: id.id, relationshipStatus: "not_contacted", contactSource: "Fictional demo contact — no email on file", isDemo: true });
  await db.insert(S.projectContacts).values({ projectId: p1.id, contactId: c1.id, role: "Procurement lead" });

  const stage = async (ventureId: string, name: string) => (await db.select().from(S.pipelineStages).where(sql`${S.pipelineStages.ventureId} = ${ventureId} and ${S.pipelineStages.name} = ${name}`))[0]?.id ?? null;
  const [o1] = await db.insert(S.opportunities).values({ title: "[DEMO] Coral Bay — guestroom & public area FF&E", projectId: p1.id, ventureId: v.calibro, stageId: await stage(v.calibro, "Qualified"),
    opportunityType: "FF&E supply", scope: "320 guestrooms + lobby, all-day dining", qualificationStatus: "qualifying", priority: "high", estimatedValue: null,
    nextAction: null, followUpDate: addDays(-2), isDemo: true }).returning();
  await db.insert(S.opportunityContacts).values({ opportunityId: o1.id, contactId: c1.id });
  await db.insert(S.opportunities).values([
    { title: "[DEMO] Coral Bay — lobby feature surfaces", projectId: p1.id, ventureId: v.moog, stageId: await stage(v.moog, "Identified"), opportunityType: "Special finishes", priority: "medium", nextAction: "Send sample board to designer", followUpDate: addDays(5), isDemo: true },
    { title: "[DEMO] Marina Heights — refurbishment FF&E", projectId: p2.id, ventureId: v.calibro, stageId: await stage(v.calibro, "Identified"), priority: "medium", isDemo: true },
  ]);

  await db.insert(S.tasks).values([
    { title: "[DEMO] Confirm FF&E tender timeline with Atelier Noor", priority: "high", dueDate: addDays(-1), projectId: p1.id, isDemo: true },
    { title: "[DEMO] Prepare Calibro hospitality credentials pack", priority: "medium", dueDate: addDays(3), opportunityId: o1.id, isDemo: true },
  ]);
  await db.insert(S.activities).values({ type: "call", subject: "[DEMO] Intro call with procurement", projectId: p1.id, contactId: c1.id, opportunityId: o1.id, notes: "Fictional demo activity.", occurredAt: new Date(Date.now() - 3 * 86400000), isDemo: true });
  await db.insert(S.newsItems).values([
    { title: "[DEMO] Coral Bay appoints interior designer for island resort", url: "https://example.com/demo/news-1", normalizedUrl: normalizeUrl("https://example.com/demo/news-1")!, normalizedTitle: normalizeName("demo coral bay appoints interior designer"),
      sourceName: "Example News (demo)", publishedAt: addDays(-4), category: "appointment", sectorId: sec["hotels-resorts"], location: "Ras Al Khaimah", developerId: dev.id, projectId: p1.id, relevance: 5, summary: "Fictional demo news item.", isDemo: true },
    { title: "[DEMO] New lifestyle hotel planned for Dubai Creek", url: "https://example.com/demo/news-2", normalizedUrl: normalizeUrl("https://example.com/demo/news-2")!, normalizedTitle: normalizeName("demo new lifestyle hotel dubai creek"),
      sourceName: "Example News (demo)", publishedAt: addDays(-1), category: "hotel_resort", sectorId: sec["hotels-resorts"], location: "Dubai", relevance: 4, summary: "Fictional demo news item.", isDemo: true },
  ]);
  await db.insert(S.discoveries).values([
    { title: "[DEMO] 250-key wellness resort proposed in Fujairah with spa and feature surfaces", normalizedTitle: normalizeName("demo 250 key wellness resort fujairah"), url: "https://example.com/demo/disc-1",
      normalizedUrl: normalizeUrl("https://example.com/demo/disc-1"), sourceName: "Example News (demo)", sectorId: sec["resort"], location: "Fujairah", developerName: "Unknown", summary: "Fictional demo discovery: resort with spa, lobby special finishes and FF&E.", isDemo: true },
    { title: "[DEMO] Coral Bay Island Resort", normalizedTitle: normalizeName("[DEMO] Coral Bay Island Resort"), url: "https://example.com/demo/disc-2", normalizedUrl: normalizeUrl("https://example.com/demo/disc-2"),
      sourceName: "Example News (demo)", location: "Ras Al Khaimah", summary: "Fictional demo — likely duplicate of an existing project.", isDemo: true },
  ]);

  // Demo workflows + agent runs, so the Command Centre shows the full lifecycle
  const [wf] = await db.insert(S.workflows).values({
    name: "[DEMO] Qualified Calibro opportunity → follow-up + outreach", description: "Demonstration workflow.", ventureId: v.calibro,
    triggerType: "manual", mode: "assist", enabled: true, isDemo: true,
    steps: [{ type: "schedule_follow_up", config: { title: "Follow up: {{entity.title}}", daysFromNow: 3, priority: "high" } },
            { type: "request_approval", config: { title: "Approve outreach for {{entity.title}}", risk: "high" } },
            { type: "run_agent", config: { agentKey: "outreach", instruction: "Introduce Calibro's hospitality FF&E capability" } }],
  }).returning();
  await startWorkflowRun(wf.id, { source: "manual (demo)", entityType: "opportunity", entityId: o1.id });

  await startAgentRun({ agentKey: "research", instruction: "Research Marina Heights refurbishment", targetType: "project", targetId: p2.id });
  await startAgentRun({ agentKey: "sales", instruction: "Pipeline review", ventureId: v.calibro });
  await startAgentRun({ agentKey: "business_development", instruction: "Route new discoveries" });
  const out = await startAgentRun({ agentKey: "outreach", instruction: "Introduce Calibro's hospitality FF&E capability", targetType: "opportunity", targetId: o1.id });
  await startAgentRun({ agentKey: "executive_assistant", instruction: "Daily brief" });
  await startAgentRun({ agentKey: "marketing", instruction: "UAE resort pipeline trends", ventureId: v.moog });
  // Approve the outreach email to show a simulated execution end-to-end
  const [appr] = await db.select().from(S.approvals).where(eq(S.approvals.agentRunId, out.runId));
  if (appr) await decideApproval(appr.id, "approved", "Demo approval");
  await db.insert(S.commandMessages).values([
    { role: "user", content: "[DEMO] Research Marina Heights refurbishment" },
    { role: "agent", content: "[DEMO] Routed to Research & Intelligence Agent. Research checklist and tasks prepared; web search is simulated until a provider is connected." },
  ]);

  // Flag everything generated during seeding as demo
  for (const t of [S.tasks, S.notifications, S.approvals, S.agentRuns, S.workflowRuns, S.researchSessions, S.activities, S.commandMessages, S.discoveries, S.opportunities]) {
    await db.update(t as any).set({ isDemo: true }).where(gte((t as any).createdAt, started));
  }
}
