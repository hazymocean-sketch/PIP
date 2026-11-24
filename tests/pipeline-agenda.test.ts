import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { createRecord, parseFields } from "@/server/entities";
import { goLive, moveDeal } from "@/server/live";
import { columnsFor } from "@/lib/pipeline";
import { addDays, addMonths, dayOf, timeOf, weekStart } from "@/lib/dubai";
import { MEETING_FIELDS } from "@/lib/fields";

describe("Pipeline moves", () => {
  it("moves through stages, closes on Won, needs a reason for Lost, and re-opens", async () => {
    const { seedBase } = await import("@/server/seed"); await seedBase();
    const p = await createRecord("projects", { name: "Pipeline Move Hotel" });
    const [v] = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(1);
    await db.insert(S.projectVentures).values({ projectId: p.id, ventureId: v.id });
    await goLive(p.id);
    const [o] = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    const stages = (await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.ventureId, v.id))).sort((a, b) => a.sortOrder - b.sortOrder);
    const open = stages.filter((s) => !s.isClosed), won = stages.find((s) => s.isWon)!, lost = stages.find((s) => s.isClosed && !s.isWon)!;

    await moveDeal(o.id, `stage:${open[2].id}`);
    let [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    expect(cur.stageId).toBe(open[2].id);
    const cols = columnsFor({ id: cur.id, title: cur.title, venture_id: cur.ventureId, stage_id: cur.stageId, commercial_status: cur.commercialStatus }, stages as any);
    expect(cols.cols[cols.current].label).toBe(open[2].name);
    expect(cols.cols.at(-1)!.lost).toBe(true);

    await expect(moveDeal(o.id, `stage:${lost.id}`)).rejects.toThrow(/reason/);
    await moveDeal(o.id, `stage:${lost.id}`, "Price");
    [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    expect(cur.commercialStatus).toBe("lost"); expect(cur.stageId).toBe(lost.id); expect(cur.lostReason).toBe("Price");

    await moveDeal(o.id, `stage:${open[1].id}`); // back into play
    [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    expect(cur.commercialStatus).toBe("open"); expect(cur.lostReason).toBeNull(); expect(cur.closedAt).toBeNull();

    await moveDeal(o.id, `stage:${won.id}`);
    [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    expect(cur.commercialStatus).toBe("won");
    const [proj] = await db.select().from(S.projects).where(eq(S.projects.id, p.id));
    expect(proj.status).toBe("won"); expect(proj.isLive).toBe(false);
  });

  it("refuses a stage from another venture", async () => {
    const vs = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder).limit(2);
    const o = await createRecord("opportunities", { title: "Cross venture", ventureId: vs[0].id });
    const [other] = await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.ventureId, vs[1].id)).limit(1);
    await expect(moveDeal(o.id, `stage:${other.id}`)).rejects.toThrow(/another venture/);
  });

  it("deals without a venture use a simple status track", async () => {
    const o = await createRecord("opportunities", { title: "No venture deal" });
    await moveDeal(o.id, "status:negotiation");
    const [cur] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o.id));
    const c = columnsFor({ id: cur.id, title: cur.title, venture_id: null, stage_id: null, commercial_status: cur.commercialStatus }, []);
    expect(c.cols[c.current].key).toBe("negotiation");
  });
});

describe("Agenda: Dubai time", () => {
  it("date helpers", () => {
    expect(weekStart("2026-11-25")).toBe("2026-11-23"); // Wednesday → Monday
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday → same week
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    const d = new Date("2026-11-24T21:30:00Z"); // 01:30 on the 25th in Dubai
    expect(dayOf(d)).toBe("2026-11-25"); expect(timeOf(d)).toBe("01:30");
  });

  it("meeting form times are read as Dubai time, end time optional", async () => {
    const fd = new FormData();
    fd.set("title", "Site visit"); fd.set("startsAt", "2026-11-26T10:00"); fd.set("status", "scheduled");
    const v = parseFields(fd, MEETING_FIELDS) as any;
    expect((v.startsAt as Date).toISOString()).toBe("2026-11-26T06:00:00.000Z");
    expect(v.endsAt).toBeNull();
    const m = await createRecord("meetings", v);
    expect(m.startsAt.toISOString()).toBe("2026-11-26T06:00:00.000Z");
  });
});
