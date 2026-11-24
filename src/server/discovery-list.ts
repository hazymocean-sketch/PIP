import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isUuid } from "@/lib/normalize";

/** The Discover list's current view (tab + optional search run). Shared by the list and the detail pager. */
export type DiscFilter = { status: string; run: string | null };
const STATUSES = ["review", "needs_verification", "saved", "rejected", "all"];

export function parseFilter(sp: Record<string, string | undefined>): DiscFilter {
  return { status: STATUSES.includes(sp.status ?? "") ? sp.status! : "review", run: sp.run && isUuid(sp.run) ? sp.run : null };
}

export function filterWhere(f: DiscFilter) {
  const s = f.status === "review" ? sql`d.status in ('new','needs_verification')` : f.status === "all" ? sql`true` : sql`d.status = ${f.status}`;
  return f.run ? sql`${s} and d.research_session_id = ${f.run}` : s;
}

/** Query string that keeps the view, e.g. "?status=all&run=…" ("" for the default view). */
export function filterQs(f: DiscFilter) {
  const p = new URLSearchParams();
  if (f.status !== "review") p.set("status", f.status);
  if (f.run) p.set("run", f.run);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Previous/next discovery in the same order as the list (newest first). Works even if the current one has left the view (e.g. just rejected). */
export async function neighbours(id: string, f: DiscFilter) {
  const w = filterWhere(f);
  const r = (await db.execute(sql`select
      (select d.id from discoveries d where ${w} and (d.created_at, d.id) > (c.created_at, c.id) order by d.created_at asc, d.id asc limit 1) as prev,
      (select d.id from discoveries d where ${w} and (d.created_at, d.id) < (c.created_at, c.id) order by d.created_at desc, d.id desc limit 1) as next,
      (select count(*) from discoveries d where ${w} and (d.created_at, d.id) >= (c.created_at, c.id))::int as pos,
      (select count(*) from discoveries d where ${w})::int as total,
      exists (select 1 from discoveries d where ${w} and d.id = c.id) as in_list
    from discoveries c where c.id = ${id}`)).rows[0] as { prev: string | null; next: string | null; pos: number; total: number; in_list: boolean } | undefined;
  return r ?? { prev: null, next: null, pos: 0, total: 0, in_list: false };
}

/** Bulk delete (never touches saved discoveries — they are evidence on a project). Snapshots go to the audit log first. */
export async function deleteDiscoveriesWhere(cond: ReturnType<typeof sql>) {
  const where = sql`${cond} and d.status <> 'saved'`;
  await db.execute(sql`insert into audit_log (action, entity_type, entity_id, summary, snapshot)
    select 'delete', 'discoveries', d.id, d.title, to_jsonb(d) from discoveries d where ${where}`);
  const r = await db.execute(sql`delete from discoveries d where ${where}`);
  return r.rowCount ?? 0;
}
