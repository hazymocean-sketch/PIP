import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val } from "@/components/ui";

export const metadata = { title: "Contacts" };
export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds = [sql`true`];
  if (sp.q) conds.push(sql`(k.full_name ilike ${"%" + sp.q + "%"} or k.position ilike ${"%" + sp.q + "%"} or c.name ilike ${"%" + sp.q + "%"})`);
  if (sp.rel) conds.push(sql`k.relationship_status = ${sp.rel}`);
  const rows = (await db.execute(sql`select k.*, c.name as company, (select count(*) from project_contacts pc where pc.contact_id = k.id)::int as projects
    from contacts k left join companies c on c.id = k.company_id where ${sql.join(conds, sql` and `)} order by k.full_name limit 500`)).rows as any[];
  return (<>
    <PageHead title="Contacts" sub="Stakeholders. Contact details only when publicly available or provided by you — never guessed." actions={<Link className="btn primary" href="/contacts/new">New contact</Link>} />
    <Flash sp={sp} />
    <form className="filters"><input type="search" name="q" placeholder="Search name, position, company" defaultValue={sp.q ?? ""} />
      <select name="rel" defaultValue={sp.rel ?? ""}><option value="">Any relationship</option>{C.RELATIONSHIP_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><button className="btn">Filter</button></form>
    <Card tight>{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Name</th><th>Position</th><th>Company</th><th>Relationship</th><th className="hide-sm">Email</th><th className="hide-sm">Projects</th><th className="hide-sm">Verification</th></tr></thead><tbody>
      {rows.map((k) => <tr key={k.id}><td><Link className="title" href={`/contacts/${k.id}`}>{k.full_name}</Link> <Demo on={k.is_demo} /></td><td><Val v={k.position} /></td><td><Val v={k.company} unknown="—" /></td>
        <td><StatusBadge value={k.relationship_status} opts={C.RELATIONSHIP_STATUS} /></td><td className="hide-sm small"><Val v={k.email} unknown="Not on file" /></td><td className="hide-sm num">{k.projects}</td><td className="hide-sm"><StatusBadge value={k.verification_status} opts={C.VERIFICATION} /></td></tr>)}
    </tbody></table></div> : <Empty title="No contacts yet" action={<Link className="btn primary" href="/contacts/new">Add contact</Link>} />}</Card>
  </>);
}
