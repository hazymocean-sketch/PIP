import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ ai: null as null | ((p: string) => string | Promise<string>), search: true }));
vi.mock("@/server/ai/providers", async (orig) => {
  const actual = await orig<typeof import("@/server/ai/providers")>();
  return {
    ...actual,
    getSearchProvider: () => h.search ? { id: "test", label: "Test", search: async (q: string) => [1, 2].map((n) => ({ title: `Result ${n}: ${q}`, url: `https://news.example.com/${encodeURIComponent(q)}/${n}`, snippet: "Developer Sample Dev LLC appointed Sample Builders as main contractor; opening Q2 2028.", publishedAt: "Sat, 22 Nov 2026 10:00:00 GMT" })) } : null,
    getAIProvider: () => h.ai ? { id: "test-ai", label: "Test AI", complete: async (_s: string, p: string) => h.ai!(p) } : null,
  };
});

import { db } from "@/db";
import * as S from "@/db/schema";
import { createRecord } from "@/server/entities";
import { applyFacts, closeDeal, deepResearch, goLive, parseFacts, reopenDeal, stopLive } from "@/server/live";

async function projectWith(name: string, ventures: number) {
  const p = await createRecord("projects", { name, city: "Ras Al Khaimah" });
  const vs = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(ventures);
  for (const v of vs) await db.insert(S.projectVentures).values({ projectId: p.id, ventureId: v.id });
  return { p, vs };
}

describe("Go live, research and CRM", () => {
  it("going live opens one deal per venture, once", async () => {
    const { seedBase } = await import("@/server/seed"); await seedBase();
    const { p, vs } = await projectWith("Live Test Resort", 2);
    expect((await goLive(p.id)).created).toBe(2);
    expect((await goLive(p.id)).created).toBe(0); // idempotent
    const deals = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    expect(deals.map((d) => d.ventureId).sort()).toEqual(vs.map((v) => v.id).sort());
    expect(deals.every((d) => d.stageId)).toBe(true);
    const [row] = await db.select().from(S.projects).where(eq(S.projects.id, p.id));
    expect(row.isLive).toBe(true); expect(row.status).toBe("active_opportunity");
    await stopLive(p.id);
    expect((await db.select().from(S.projects).where(eq(S.projects.id, p.id)))[0].isLive).toBe(false);
  });

  it("a project with no venture still gets one deal", async () => {
    const { p } = await projectWith("No Venture Tower", 0);
    expect((await goLive(p.id)).created).toBe(1);
  });

  it("research without AI attaches sources only and says so", async () => {
    h.ai = null;
    const { p } = await projectWith("Research NoAI Hotel", 0);
    const r = await deepResearch(p.id);
    expect(r.status).toBe("done"); expect(r.added).toBeGreaterThan(0); expect(r.filled).toBe(0);
    expect(r.note).toMatch(/AI not connected/);
    const again = await deepResearch(p.id); // same URLs → not duplicated
    expect(again.added).toBe(0);
    const links = await db.select().from(S.projectCompanies).where(eq(S.projectCompanies.projectId, p.id));
    expect(links.length).toBe(0); // nothing invented
  });

  it("research with AI fills only empty facts and never overwrites", async () => {
    h.ai = () => `Here: {"developer":"Sample Dev LLC","main_contractor":"Sample Builders","others":[{"name":"Sample Architects","role":"architect"},{"name":"unknown","role":"consultant"},{"name":"Bad Role Co","role":"wizard"}],"development_stage":"under_construction","procurement_stage":"bogus","expected_completion":"Q2 2028"}`;
    const { p } = await projectWith("Research AI Hotel", 0);
    await db.update(S.projects).set({ expectedCompletion: "Opening 2029 (my note)" }).where(eq(S.projects.id, p.id));
    const r = await deepResearch(p.id);
    expect(r.filled).toBe(4); // developer, main contractor, architect, stage
    const [row] = await db.select().from(S.projects).where(eq(S.projects.id, p.id));
    expect(row.developmentStage).toBe("under_construction");
    expect(row.procurementStage).toBe("unknown");
    expect(row.expectedCompletion).toBe("Opening 2029 (my note)");
    const roles = (await db.select().from(S.projectCompanies).where(eq(S.projectCompanies.projectId, p.id))).map((x) => x.role).sort();
    expect(roles).toEqual(["architect", "developer", "main_contractor"]);
    h.ai = null;
  });

  it("an AI error falls back gracefully", async () => {
    h.ai = () => { throw new Error("credit balance too low"); };
    const { p } = await projectWith("Research AI Error Hotel", 0);
    const r = await deepResearch(p.id);
    expect(r.status).toBe("done"); expect(r.note).toMatch(/AI unavailable/);
    h.ai = null;
  });

  it("no search provider → clear failure, nothing changes", async () => {
    h.search = false;
    const { p } = await projectWith("No Search Hotel", 0);
    const r = await deepResearch(p.id);
    expect(r.status).toBe("failed"); expect(r.note).toMatch(/No search provider/);
    h.search = true;
  });

  it("parseFacts ignores junk", () => {
    expect(parseFacts("no json here")).toBeNull();
    expect(parseFacts('{"developer": "X"}')?.developer).toBe("X");
  });

  it("won/lost closes deals, moves stage, and closes the project when all deals are done; reopen restores", async () => {
    const { p } = await projectWith("Close Test Mall", 2);
    await goLive(p.id);
    const [a, b] = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    const won = await closeDeal(a.id, "won");
    expect(won.closedAt).toBeTruthy();
    const [wonStage] = await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.id, won.stageId!));
    expect(wonStage.isWon).toBe(true);
    expect((await db.select().from(S.projects).where(eq(S.projects.id, p.id)))[0].isLive).toBe(true);
    const lost = await closeDeal(b.id, "lost", "Price — 12% above winner");
    expect(lost.lostReason).toBe("Price — 12% above winner");
    const [proj] = await db.select().from(S.projects).where(eq(S.projects.id, p.id));
    expect(proj.isLive).toBe(false); expect(proj.status).toBe("won");
    await reopenDeal(b.id);
    const [proj2] = await db.select().from(S.projects).where(eq(S.projects.id, p.id));
    expect(proj2.isLive).toBe(true);
    const [b2] = await db.select().from(S.opportunities).where(and(eq(S.opportunities.id, b.id)));
    expect(b2.lostReason).toBeNull(); expect(b2.closedAt).toBeNull();
  });

  it("editing a deal to lost through the form sets the closed date", async () => {
    const { updateRecord } = await import("@/server/entities");
    const o = await createRecord("opportunities", { title: "Form close test" });
    const r = await updateRecord("opportunities", o.id, { title: "Form close test", commercialStatus: "lost" } as any);
    expect(r.closedAt).toBeTruthy();
  });
});
