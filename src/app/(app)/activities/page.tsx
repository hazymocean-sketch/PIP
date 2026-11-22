import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, SectionTabs, fmtDate, Badge } from "@/components/ui";

export const metadata = { title: "Meetings & Activities" };
export default async function Activities({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds = [sql`true`];
  if (sp.type) conds.push(sql`a.type = ${sp.type}`);
  if (sp.q) conds.push(sql`(a.subject ilike ${"%" + sp.q + "%"} or a.notes ilike ${"%" + sp.q + "%"})`);
  const rows = (await db.execute(sql`select a.*, p.name as project, o.title as opp, c.name as company, k.full_name as contact from activities a
    left join projects p on p.id = a.project_id left join opportunities o on o.id = a.opportunity_id left join companies c on c.id = a.company_id left join contacts k on k.id = a.contact_id
    where ${sql.join(conds, sql` and `)} order by a.occurred_at desc limit 500`)).rows as any[];
  return (<>
    <PageHead title="Agenda" sub="Meetings, calls, emails, site visits, research and decisions — each linked to the project, company, contact or opportunity it concerns." actions={<Link className="btn primary" href="/activities/new">Log activity</Link>} />
    <SectionTabs section="agenda" active="Meetings & activities" />
    <Flash sp={sp} />
    <form className="filters"><input type="search" name="q" placeholder="Search" defaultValue={sp.q ?? ""} />
      <select name="type" defaultValue={sp.type ?? ""}><option value="">All types</option>{C.ACTIVITY_TYPE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><button className="btn">Filter</button></form>
    <Card tight>{rows.length ? <div className="list">{rows.map((a) => (
      <Link key={a.id} href={`/activities/${a.id}/edit`} className="li">
        <Badge tone="outline">{C.label(C.ACTIVITY_TYPE, a.type)}</Badge>
        <div className="grow"><div className="ttl">{a.subject} <Demo on={a.is_demo} /></div>
          <div className="meta">{fmtDate(a.occurred_at, true)}{[a.project, a.opp, a.company, a.contact].filter(Boolean).map((x: string) => ` · ${x}`).join("")}</div>
          {a.outcome ? <div className="small" style={{ marginTop: 3, color: "var(--text-2)" }}>Outcome: {a.outcome}</div> : null}</div>
      </Link>))}</div> : <Empty title="No activities logged" action={<Link className="btn primary" href="/activities/new">Log activity</Link>} />}</Card>
  </>);
}
