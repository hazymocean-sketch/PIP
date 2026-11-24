import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { deleteDiscoveriesWhere, filterQs, neighbours, parseFilter } from "@/server/discovery-list";

async function makeRun(title: string, n: number) {
  const [run] = await db.insert(S.researchSessions).values({ kind: "discovery", title }).returning();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const [d] = await db.insert(S.discoveries).values({ title: `${title} item ${i}`, normalizedTitle: `${title} item ${i}`.toLowerCase(), kind: "project", researchSessionId: run.id, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) }).returning();
    ids.push(d.id);
  }
  return { run, ids }; // ids[0] oldest … ids[n-1] newest
}

describe("Discover list: filter, pager, delete", () => {
  it("parses and rebuilds the view filter safely", () => {
    expect(parseFilter({})).toEqual({ status: "review", run: null });
    expect(parseFilter({ status: "bogus", run: "not-a-uuid" })).toEqual({ status: "review", run: null });
    expect(filterQs({ status: "all", run: null })).toBe("?status=all");
  });

  it("next/previous follow the list order (newest first) within one search run", async () => {
    const { run, ids } = await makeRun("Pager run", 3);
    const f = { status: "all", run: run.id };
    const mid = await neighbours(ids[1], f);
    expect(mid.prev).toBe(ids[2]); expect(mid.next).toBe(ids[0]);
    expect(mid.pos).toBe(2); expect(mid.total).toBe(3);
    const first = await neighbours(ids[2], f);
    expect(first.prev).toBeNull(); expect(first.pos).toBe(1);
    // after rejecting the middle one in the "To review" view, next still moves on
    await db.update(S.discoveries).set({ status: "rejected" }).where(eq(S.discoveries.id, ids[1]));
    const after = await neighbours(ids[1], { status: "review", run: run.id });
    expect(after.in_list).toBe(false); expect(after.next).toBe(ids[0]); expect(after.total).toBe(2);
  });

  it("deleting a search run removes its unsaved results only and keeps an audit snapshot", async () => {
    const { run, ids } = await makeRun("Delete run", 3);
    const { ids: other } = await makeRun("Other run", 1);
    await db.update(S.discoveries).set({ status: "saved" }).where(eq(S.discoveries.id, ids[0]));
    const n = await deleteDiscoveriesWhere(sql`d.research_session_id = ${run.id}`);
    expect(n).toBe(2);
    const left = await db.select().from(S.discoveries).where(eq(S.discoveries.researchSessionId, run.id));
    expect(left.map((d) => d.id)).toEqual([ids[0]]);
    expect((await db.select().from(S.discoveries).where(eq(S.discoveries.id, other[0]))).length).toBe(1);
    const audit = await db.select().from(S.auditLog).where(eq(S.auditLog.entityId, ids[1]));
    expect(audit[0]?.action).toBe("delete");
  });

  it("bulk delete by ids skips saved ones", async () => {
    const { ids } = await makeRun("Bulk run", 3);
    await db.update(S.discoveries).set({ status: "saved" }).where(eq(S.discoveries.id, ids[2]));
    const n = await deleteDiscoveriesWhere(sql`d.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    expect(n).toBe(2);
  });
});
