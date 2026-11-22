import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val, fmtDate, fmtMoney, Tabs } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Opportunities" };
export default async function Opps({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ventures = (await db.execute(sql`select id, name from ventures where active order by sort_order`)).rows as any[];
  const conds = [sql`true`];
  if (sp.venture) conds.push(sql`o.venture_id = ${sp.venture}`);
  if (sp.qualification) conds.push(sql`o.qualification_status = ${sp.qualification}`);
  if (sp.status) conds.push(sql`o.commercial_status = ${sp.status}`);
  if (sp.priority) conds.push(sql`o.priority = ${sp.priority}`);
  if (sp.q) conds.push(sql`o.title ilike ${"%" + sp.q + "%"}`);
  const rows = (await db.execute(sql`select o.*, v.name as venture, p.name as project, st.name as stage, st.sort_order as stage_order from opportunities o
    left join ventures v on v.id = o.venture_id left join projects p on p.id = o.project_id left join pipeline_stages st on st.id = o.stage_id
    where ${sql.join(conds, sql` and `)} order by o.follow_up_date asc nulls last, o.updated_at desc limit 500`)).rows as any[];
  const stages = sp.venture ? (await db.execute(sql`select id, name from pipeline_stages where venture_id = ${sp.venture} order by sort_order`)).rows as any[] : [];
  const today = new Date().toISOString().slice(0, 10);
  const qs = (v?: string) => { const p = new URLSearchParams(sp); p.delete("ok"); p.delete("error"); if (v) p.set("venture", v); else p.delete("venture"); return `/opportunities?${p}`; };
  return (<>
    <PageHead title="Opportunities" sub="Commercial opportunities, each tied to one venture's pipeline. One project can produce several." actions={<Link className="btn primary" href="/opportunities/new"><Icon name="plus" />New opportunity</Link>} />
    <Flash sp={sp} />
    <Tabs active={ventures.find((v) => v.id === sp.venture)?.name ?? "All ventures"} items={[{ href: qs(), label: "All ventures" }, ...ventures.map((v) => ({ href: qs(v.id), label: v.name }))]} />
    <form className="filters">{sp.venture ? <input type="hidden" name="venture" value={sp.venture} /> : null}
      <input type="search" name="q" placeholder="Search" defaultValue={sp.q ?? ""} />
      <select name="qualification" defaultValue={sp.qualification ?? ""}><option value="">Any qualification</option>{C.QUALIFICATION_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <select name="status" defaultValue={sp.status ?? ""}><option value="">Any status</option>{C.COMMERCIAL_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <select name="priority" defaultValue={sp.priority ?? ""}><option value="">Any priority</option>{C.PRIORITY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <button className="btn">Filter</button></form>
    {stages.length ? <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(stages.length, 8)}, minmax(180px, 1fr))`, overflowX: "auto", marginBottom: 14 }}>
      {stages.map((s) => { const items = rows.filter((r) => r.stage_id === s.id); return (
        <div key={s.id} className="card"><div className="card-h"><h2>{s.name}</h2><span className="sub">{items.length}</span></div>
          <div className="list">{items.map((o) => <Link key={o.id} href={`/opportunities/${o.id}`} className="li"><div className="grow"><div className="ttl small">{o.title} <Demo on={o.is_demo} /></div><div className="meta">{o.project ?? "No project"}</div></div></Link>)}</div></div>); })}
    </div> : null}
    <Card tight>{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Opportunity</th><th>Venture</th><th className="hide-sm">Project</th><th>Stage</th><th>Qualification</th><th>Priority</th><th className="hide-sm">Value</th><th>Next action</th><th>Follow-up</th></tr></thead><tbody>
      {rows.map((o) => <tr key={o.id}><td><Link className="title" href={`/opportunities/${o.id}`}>{o.title}</Link> <Demo on={o.is_demo} /></td><td>{o.venture ?? <span className="faint">—</span>}</td>
        <td className="hide-sm">{o.project ? <Link className="link" href={`/projects/${o.project_id}`}>{o.project}</Link> : <span className="faint">—</span>}</td>
        <td className="small">{o.stage ?? C.label(C.COMMERCIAL_STATUS, o.commercial_status)}</td><td><StatusBadge value={o.qualification_status} opts={C.QUALIFICATION_STATUS} /></td>
        <td><StatusBadge value={o.priority} opts={C.PRIORITY} /></td><td className="hide-sm num"><Val v={fmtMoney(o.estimated_value, o.value_currency)} /></td>
        <td className="small"><Val v={o.next_action} unknown="None set" /></td>
        <td className="nowrap small" style={{ color: o.follow_up_date && o.follow_up_date < today ? "var(--red)" : undefined }}>{fmtDate(o.follow_up_date) ?? <span className="faint">—</span>}</td></tr>)}
    </tbody></table></div> : <Empty title="No opportunities" action={<Link className="btn primary" href="/opportunities/new"><Icon name="plus" />Add opportunity</Link>}>Create opportunities from qualified projects.</Empty>}</Card>
  </>);
}
