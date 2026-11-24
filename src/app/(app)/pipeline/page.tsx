import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Empty, Flash, PageHead } from "@/components/ui";
import { DealPipeline, type Deal, type Stage } from "@/components/deal-pipeline";
import { isUuid } from "@/lib/normalize";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const project = sp.project && isUuid(sp.project) ? sp.project : null;
  const venture = sp.venture && isUuid(sp.venture) ? sp.venture : null;
  const keep: Record<string, string> = {}; if (project) keep.project = project; if (venture) keep.venture = venture;
  const href = (patch: Record<string, string | null>) => { const p = new URLSearchParams(keep); for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); } return `/pipeline${p.toString() ? `?${p}` : ""}`; };
  const back = href({});

  const conds = [project ? sql`o.project_id = ${project}` : sql`o.commercial_status not in ('won','lost')`];
  if (venture) conds.push(sql`o.venture_id = ${venture}`);
  const [dealsR, stagesR, venturesR, projR] = await Promise.all([
    db.execute(sql`select o.id, o.title, o.venture_id, v.name as venture, o.stage_id, o.commercial_status, o.lost_reason, o.estimated_value, o.next_action, o.follow_up_date, o.project_id, p.name as project, o.is_demo
      from opportunities o left join ventures v on v.id = o.venture_id left join projects p on p.id = o.project_id
      where ${sql.join(conds, sql` and `)}
      order by case when o.commercial_status in ('won','lost') then 1 else 0 end, p.name nulls last, v.sort_order nulls last, o.created_at limit 200`),
    db.execute(sql`select id, venture_id as "ventureId", name, sort_order as "sortOrder", is_closed as "isClosed", is_won as "isWon" from pipeline_stages`),
    db.execute(sql`select id, name from ventures where active order by sort_order`),
    project ? db.execute(sql`select id, name, city, is_live from projects where id = ${project}`) : Promise.resolve({ rows: [] }),
  ]);
  const deals = dealsR.rows as Deal[];
  const stages = stagesR.rows as Stage[];
  const ventures = venturesR.rows as { id: string; name: string }[];
  const proj = projR.rows[0] as { id: string; name: string; city: string | null; is_live: boolean } | undefined;

  // Group by project (all-deals view) so a project's ventures sit together
  const groups = new Map<string, Deal[]>();
  for (const d of deals) { const k = d.project_id ?? `x-${d.id}`; groups.set(k, [...(groups.get(k) ?? []), d]); }

  return (<>
    <PageHead title={proj ? proj.name : "Pipeline"} crumbs={proj ? [{ href: "/pipeline", label: "Pipeline" }] : undefined}
      sub={proj ? "Every deal on this project, stage by stage until won or lost. Click a column to move the deal there." : "Every live deal, stage by stage until won or lost. Click a column to move a deal; Lost asks for a reason."}
      actions={<div className="row">{proj ? <Link className="btn" href={`/projects/${proj.id}`}>Open project</Link> : null}<Link className="btn" href="/opportunities">CRM list</Link></div>} />
    <Flash sp={sp} />
    <div className="pl-filters">
      <nav className="seg" aria-label="Venture">
        <a className={!venture ? "on" : ""} href={href({ venture: null })}>All ventures</a>
        {ventures.map((v) => <a key={v.id} className={venture === v.id ? "on" : ""} href={href({ venture: v.id })} title={v.name}>{v.name.replace(/\s*\(.*\)\s*$/, "")}</a>)}
      </nav>
      {proj ? <a className="btn sm ghost" href="/pipeline">← All live deals</a> : null}
    </div>
    {deals.length ? <div className="stack" style={{ gap: 14 }}>
      {[...groups.values()].map((list) => (
        <section key={list[0].id} className="card deal-group">
          {!proj && list[0].project_id ? <div className="deal-group-h"><Link href={`/pipeline?project=${list[0].project_id}`} className="pl-title">{list[0].project}</Link><span className="muted small">{list.length} deal{list.length === 1 ? "" : "s"}</span></div> : null}
          {list.map((d) => <DealPipeline key={d.id} deal={d} stages={stages} back={back} showProject={false} />)}
        </section>))}
    </div> : <div className="card"><Empty title={proj ? "No deals on this project yet" : "No live deals"} action={<Link className="btn primary" href="/projects">Go to Projects</Link>}>Press <b>Go live</b> on a project to open its deals.</Empty></div>}
  </>);
}
