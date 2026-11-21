import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val } from "@/components/ui";

export const metadata = { title: "Companies" };
export default async function Companies({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds = [sql`true`];
  if (sp.q) conds.push(sql`(c.name ilike ${"%" + sp.q + "%"} or c.description ilike ${"%" + sp.q + "%"})`);
  if (sp.category) conds.push(sql`c.category = ${sp.category}`);
  const rows = (await db.execute(sql`select c.*, (select count(distinct project_id) from project_companies pc where pc.company_id = c.id)::int as projects,
    (select count(*) from contacts k where k.company_id = c.id)::int as contacts from companies c where ${sql.join(conds, sql` and `)} order by c.name limit 500`)).rows as any[];
  return (<>
    <PageHead title="Companies" sub="Developers, owners, operators, consultants, designers, contractors and partners." actions={<Link className="btn primary" href="/companies/new">New company</Link>} />
    <Flash sp={sp} />
    <form className="filters"><input type="search" name="q" placeholder="Search companies" defaultValue={sp.q ?? ""} />
      <select name="category" defaultValue={sp.category ?? ""}><option value="">All categories</option>{C.COMPANY_CATEGORY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <button className="btn">Filter</button></form>
    <Card tight>{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Company</th><th>Category</th><th>Location</th><th className="hide-sm">Website</th><th>Projects</th><th>Contacts</th><th className="hide-sm">Verification</th></tr></thead><tbody>
      {rows.map((c) => <tr key={c.id}><td><Link className="title" href={`/companies/${c.id}`}>{c.name}</Link> <Demo on={c.is_demo} /></td><td>{C.label(C.COMPANY_CATEGORY, c.category)}</td><td><Val v={c.location} /></td>
        <td className="hide-sm small">{c.website ? <a className="link" href={c.website} target="_blank" rel="noopener noreferrer">{c.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}</a> : <span className="faint">—</span>}</td>
        <td className="num">{c.projects}</td><td className="num">{c.contacts}</td><td className="hide-sm"><StatusBadge value={c.verification_status} opts={C.VERIFICATION} /></td></tr>)}
    </tbody></table></div> : <Empty title="No companies yet" action={<Link className="btn primary" href="/companies/new">Add company</Link>}>Companies are also created when you link a new stakeholder to a project.</Empty>}</Card>
  </>);
}
