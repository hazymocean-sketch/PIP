import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { createRecord } from "@/server/entities";
import { buildQueries, SECTOR_QUERIES, saveDiscoveryAsProject, sectorIdForSlug, sectorSlugFor } from "@/server/research";
import { goLive } from "@/server/live";
import { mergeProjects } from "@/server/merge";

describe("Sector searches", () => {
  it("each sector has its own list; typed words alone; general list when empty", () => {
    expect(Object.keys(SECTOR_QUERIES)).toEqual(expect.arrayContaining(["hotels-resorts", "residential", "office-commercial", "fnb-retail-leisure", "education-institutional", "healthcare", "government-cultural"]));
    const res = buildQueries(null, "Dubai", "residential");
    expect(res.length).toBeGreaterThanOrEqual(6); expect(res.every((q) => q.includes("Dubai"))).toBe(true);
    expect(buildQueries("mosque contractor Sharjah", null, null)).toEqual(["mosque contractor Sharjah"]);
    expect(buildQueries("new school campus", "Ajman", null)).toEqual(["new school campus Ajman"]);
    expect(buildQueries(null, null, null)[0]).toMatch(/UAE/);
    expect(buildQueries(null, "UAE", "hotels")).toEqual(buildQueries(null, "UAE", "hotels-resorts")); // old schedules keep working
  });
  it("sub-sectors map to their parent's list; new sectors are seeded", async () => {
    const { seedBase } = await import("@/server/seed"); await seedBase();
    const mosque = await sectorIdForSlug("mosque");
    expect(await sectorSlugFor(mosque)).toBe("government-cultural");
    expect(await sectorIdForSlug("healthcare")).toBeTruthy();
    const weekly = await db.select().from(S.workflows);
    const names = weekly.map((w) => w.name);
    for (const n of ["Residential", "Office", "F&B", "Education", "Healthcare", "Government"]) expect(names.some((x) => x.startsWith("Weekly discovery") && x.includes(n))).toBe(true);
  });
});

describe("One project, several ventures", () => {
  it("saving the same project again adds the venture instead of a duplicate (and opens its deal if live)", async () => {
    const [cal, moog] = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(2);
    const [d1] = await db.insert(S.discoveries).values({ title: "Holm One tower announced", normalizedTitle: "holm one tower announced", kind: "project" }).returning();
    const p = await saveDiscoveryAsProject(d1.id, { name: "Holm One Test", ventureIds: [cal.id] });
    expect(p.mergedInto).toBeFalsy();
    await goLive(p.id);
    const [d2] = await db.insert(S.discoveries).values({ title: "Holm One contractor appointed", normalizedTitle: "holm one contractor appointed", kind: "project" }).returning();
    const again = await saveDiscoveryAsProject(d2.id, { name: "Holm One Test", ventureIds: [moog.id] });
    expect(again.mergedInto).toBe(true); expect(again.id).toBe(p.id); expect(again.addedVentures).toBe(1);
    const vs = await db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, p.id));
    expect(vs.length).toBe(2);
    const deals = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    expect(deals.map((x) => x.ventureId).sort()).toEqual([cal.id, moog.id].sort());
    const count = await db.select().from(S.projects).where(eq(S.projects.normalizedName, p.normalizedName!));
    expect(count.length).toBe(1);
  });

  it("merge moves ventures, deals, sources and companies, fills gaps, deletes the duplicate", async () => {
    const [cal, moog] = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(2);
    const keep = await createRecord("projects", { name: "Merge Keep Towers" });
    const drop = await createRecord("projects", { name: "Merge Keep Towers (dup)", city: "Dubai", expectedCompletion: "Q4 2027" });
    await db.insert(S.projectVentures).values([{ projectId: keep.id, ventureId: cal.id }, { projectId: drop.id, ventureId: moog.id }, { projectId: drop.id, ventureId: cal.id }]);
    const co = await createRecord("companies", { name: "Merge Dev Co" });
    await db.insert(S.projectCompanies).values([{ projectId: keep.id, companyId: co.id, role: "developer" }, { projectId: drop.id, companyId: co.id, role: "developer" }]);
    await db.insert(S.sources).values({ projectId: drop.id, url: "https://example.com/merge", sourceName: "x", infoStatus: "reported" });
    const opp = await createRecord("opportunities", { title: "Dup deal", projectId: drop.id, ventureId: moog.id });
    await mergeProjects(keep.id, drop.id);
    expect((await db.select().from(S.projects).where(eq(S.projects.id, drop.id))).length).toBe(0);
    const [k] = await db.select().from(S.projects).where(eq(S.projects.id, keep.id));
    expect(k.city).toBe("Dubai"); expect(k.expectedCompletion).toBe("Q4 2027");
    expect((await db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, keep.id))).length).toBe(2);
    expect((await db.select().from(S.projectCompanies).where(eq(S.projectCompanies.projectId, keep.id))).length).toBe(1);
    expect((await db.select().from(S.sources).where(eq(S.sources.projectId, keep.id))).length).toBe(1);
    expect((await db.select().from(S.opportunities).where(eq(S.opportunities.id, opp.id)))[0].projectId).toBe(keep.id);
    await expect(mergeProjects(keep.id, keep.id)).rejects.toThrow();
  });
});

describe("CRM ↔ Projects sync", () => {
  it("a deal saved without a project gets one (live), named without the venture suffix; reuses an existing project", async () => {
    const { createRecord } = await import("@/server/entities");
    const [v] = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(1);
    const o = await createRecord("opportunities", { title: `Sync Central Towers — ${v.name}`, ventureId: v.id });
    expect(o.projectId).toBeTruthy();
    const [p] = await db.select().from(S.projects).where(eq(S.projects.id, o.projectId));
    expect(p.name).toBe("Sync Central Towers"); expect(p.isLive).toBe(true);
    expect((await db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, p.id))).length).toBe(1);
    const o2 = await createRecord("opportunities", { title: "Sync Central Towers" });
    expect(o2.projectId).toBe(p.id); // same project, no duplicate
  });
  it("repairs old deals that have no project", async () => {
    const { syncOrphanDeals } = await import("@/server/live");
    const [o] = await db.insert(S.opportunities).values({ title: "Orphan Deal Plaza" }).returning();
    expect(await syncOrphanDeals()).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    expect(after.projectId).toBeTruthy();
  });
});

describe("Open deal = live project", () => {
  it("repairs a project that has an open deal but isn't live", async () => {
    const { syncLiveFlags } = await import("@/server/live");
    const p = await createRecord("projects", { name: "Holm One Sync Test" });
    await db.insert(S.opportunities).values({ title: "Holm One Sync Test — Calibro", projectId: p.id });
    expect((await db.select().from(S.projects).where(eq(S.projects.id, p.id)))[0].isLive).toBe(false);
    expect(await syncLiveFlags()).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(S.projects).where(eq(S.projects.id, p.id)))[0].isLive).toBe(true);
  });
  it("off air puts open deals on hold; Go live resumes them", async () => {
    const { goLive, stopLive } = await import("@/server/live");
    const [v] = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(1);
    const p = await createRecord("projects", { name: "Off Air Test Tower" });
    await db.insert(S.projectVentures).values({ projectId: p.id, ventureId: v.id });
    await goLive(p.id);
    await stopLive(p.id);
    let [d] = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    expect(d.commercialStatus).toBe("on_hold");
    await goLive(p.id);
    [d] = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    expect(d.commercialStatus).toBe("open");
    expect((await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id))).length).toBe(1);
  });
  it("editing a deal on a non-live project marks the project live", async () => {
    const { updateRecord } = await import("@/server/entities");
    const p = await createRecord("projects", { name: "Edit Live Test Mall" });
    const [o] = await db.insert(S.opportunities).values({ title: "Edit Live Test Mall deal", projectId: p.id }).returning();
    await updateRecord("opportunities", o.id, { title: o.title, projectId: p.id, commercialStatus: "open" } as any);
    expect((await db.select().from(S.projects).where(eq(S.projects.id, p.id)))[0].isLive).toBe(true);
  });
});
