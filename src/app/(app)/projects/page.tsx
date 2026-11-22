import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, Score, StatusBadge, Val, fmtDate, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Projects" };

export default async function Projects({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const conds = [sql`true`];
  if (q) conds.push(sql`(p.name ilike ${"%" + q + "%"} or p.brand ilike ${"%" + q + "%"} or p.description ilike ${"%" + q + "%"})`);
  if (sp.status) conds.push(sql`p.status = ${sp.status}`);
  if (sp.sector) conds.push(sql`(p.sector_id = ${sp.sector} or p.sub_sector_id = ${sp.sector})`);
  if (sp.city) conds.push(sql`p.city ilike ${sp.city}`);
  if (sp.venture) conds.push(sql`exists (select 1 from project_ventures pv where pv.project_id = p.id and pv.venture_id = ${sp.venture})`);
  if (sp.stage) conds.push(sql`p.development_stage = ${sp.stage}`);
  const order = sp.sort === "score" ? sql`p.opportunity_score desc nulls last` : sp.sort === "name" ? sql`p.name asc` : sql`p.updated_at desc`;
  const rows = (await db.execute(sql`select p.*, s.name as sector, ss.name as sub_sector,
      (select string_agg(v.name, ', ' order by v.sort_order) from project_ventures pv join ventures v on v.id = pv.venture_id where pv.project_id = p.id) as ventures,
      (select c.name from project_companies pc join companies c on c.id = pc.company_id where pc.project_id = p.id and pc.role = 'developer' limit 1) as developer,
      (select count(*) from sources so where so.project_id = p.id)::int as source_count
    from projects p left join sectors s on s.id = p.sector_id left join sectors ss on ss.id = p.sub_sector_id
    where ${sql.join(conds, sql` and `)} order by ${order} limit 500`)).rows as any[];
  const sectors = (await db.execute(sql`select id, name from sectors where parent_id is null order by sort_order`)).rows as any[];
  const ventures = (await db.execute(sql`select id, name from ventures order by sort_order`)).rows as any[];

  return (
    <>
      <PageHead title="Projects" sub="Central project database. Missing facts are shown as Unknown — never invented." actions={<Link className="btn primary" href="/projects/new"><Icon name="plus" />New project</Link>} />
      <Flash sp={sp} />
      <form className="filters">
        <input type="search" name="q" placeholder="Search name, brand, description" defaultValue={q} />
        <select name="status" defaultValue={sp.status ?? ""}><option value="">All statuses</option>{C.PROJECT_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select name="sector" defaultValue={sp.sector ?? ""}><option value="">All sectors</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="venture" defaultValue={sp.venture ?? ""}><option value="">All ventures</option>{ventures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="stage" defaultValue={sp.stage ?? ""}><option value="">Any stage</option>{C.DEVELOPMENT_STAGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <input name="city" placeholder="Location" defaultValue={sp.city ?? ""} list="locs" /><datalist id="locs">{C.LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist>
        <select name="sort" defaultValue={sp.sort ?? ""}><option value="">Recently updated</option><option value="score">Opportunity score</option><option value="name">Name</option></select>
        <button className="btn" type="submit">Filter</button>
        {Object.keys(sp).some((k) => !["ok", "error"].includes(k)) ? <Link className="btn ghost" href="/projects">Clear</Link> : null}
      </form>
      <Card tight>
        {rows.length ? <div className="table-wrap"><table className="t">
          <thead><tr><th>Project</th><th>Status</th><th className="hide-sm">Sector</th><th>Location</th><th className="hide-sm">Developer</th><th className="hide-sm">Stage</th><th className="hide-sm">Ventures</th><th>Score</th><th className="hide-sm">Evidence</th><th className="hide-sm">Updated</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td><Link className="title" href={`/projects/${p.id}`}>{p.name}</Link> <Demo on={p.is_demo} />{p.rooms_units ? <div className="muted small">{p.rooms_units} keys/units</div> : null}</td>
              <td><StatusBadge value={p.status} opts={C.PROJECT_STATUS} /></td>
              <td className="hide-sm"><Val v={p.sub_sector ?? p.sector} unknown="—" /></td>
              <td><Val v={p.city} /></td>
              <td className="hide-sm"><Val v={p.developer} /></td>
              <td className="hide-sm small">{C.label(C.DEVELOPMENT_STAGE, p.development_stage)}</td>
              <td className="hide-sm small">{p.ventures ?? <span className="faint">—</span>}</td>
              <td><Score value={p.opportunity_score} /></td>
              <td className="hide-sm">{p.source_count ? <Badge tone="outline">{p.source_count} src</Badge> : <Badge tone="warn">none</Badge>}</td>
              <td className="hide-sm small muted nowrap">{fmtDate(p.updated_at)}</td>
            </tr>))}</tbody>
        </table></div> : <Empty title={q || Object.keys(sp).length ? "No projects match these filters" : "No projects yet"} action={<Link className="btn primary" href="/discoveries">Discover projects</Link>}>
          Save discoveries as projects, or add one manually.
        </Empty>}
      </Card>
      <p className="muted small" style={{ marginTop: 8 }}>{rows.length} project(s)</p>
    </>
  );
}
