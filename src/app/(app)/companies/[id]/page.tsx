import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { createResearchSession } from "@/server/actions";
import { ActivitiesPanel, SourcesPanel, TasksPanel } from "@/components/panels";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val } from "@/components/ui";
import { Submit } from "@/components/client";
import { Icon } from "@/components/icons";

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [c] = await db.select().from(S.companies).where(eq(S.companies.id, id));
  if (!c) notFound();
  const projects = (await db.execute(sql`select p.id, p.name, p.status, pc.role from project_companies pc join projects p on p.id = pc.project_id where pc.company_id = ${id} order by p.name`)).rows as any[];
  const people = await db.select().from(S.contacts).where(eq(S.contacts.companyId, id));
  const opps = (await db.execute(sql`select distinct o.id, o.title, o.commercial_status from opportunities o join project_companies pc on pc.project_id = o.project_id where pc.company_id = ${id}`)).rows as any[];
  const back = `/companies/${id}`;
  return (<>
    <PageHead title={<>{c.name} <Demo on={c.isDemo} /></>} crumbs={[{ href: "/companies", label: "Companies" }]} sub={<span className="row"><span>{C.label(C.COMPANY_CATEGORY, c.category)}</span><StatusBadge value={c.verificationStatus} opts={C.VERIFICATION} /></span>}
      actions={<><form action={createResearchSession}><input type="hidden" name="kind" value="company" /><input type="hidden" name="companyId" value={id} /><Submit className="btn">Research company</Submit></form><Link className="btn primary" href={`/companies/${id}/edit`}><Icon name="edit" />Edit</Link></>} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      <Card title="Profile"><dl className="kv">
        <dt>Location</dt><dd><Val v={[c.location, c.country].filter(Boolean).join(", ")} /></dd>
        <dt>Website</dt><dd>{c.website ? <a className="link" href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a> : <span className="unknown">Unknown</span>}</dd>
        <dt>Description</dt><dd className="pre"><Val v={c.description} /></dd>
        <dt>Notes</dt><dd className="pre"><Val v={c.notes} unknown="—" /></dd></dl></Card>
      <Card title="Associated projects" tight>{projects.length ? <div className="list">{projects.map((p) => <Link key={p.id + p.role} href={`/projects/${p.id}`} className="li"><div className="grow"><div className="ttl">{p.name}</div><div className="meta">{C.label(C.COMPANY_CATEGORY, p.role)}</div></div><StatusBadge value={p.status} opts={C.PROJECT_STATUS} /></Link>)}</div> : <Empty title="Not linked to any project">Link this company from a project page.</Empty>}</Card>
      <Card title="Opportunities" tight>{opps.length ? <div className="list">{opps.map((o) => <Link key={o.id} href={`/opportunities/${o.id}`} className="li"><div className="grow ttl">{o.title}</div><StatusBadge value={o.commercial_status} opts={C.COMMERCIAL_STATUS} /></Link>)}</div> : <Empty title="No opportunities via linked projects" />}</Card>
      <SourcesPanel target={{ companyId: id }} back={back} />
      <ActivitiesPanel where={eq(S.activities.companyId, id)} newHref={`/activities/new?companyId=${id}`} />
    </div><div className="stack">
      <Card title="Contacts" tight actions={<Link className="btn sm" href={`/contacts/new?companyId=${id}`}>Add</Link>}>{people.length ? <div className="list">{people.map((k) => <Link key={k.id} href={`/contacts/${k.id}`} className="li"><div className="grow"><div className="ttl">{k.fullName}</div><div className="meta">{k.position ?? "Position unknown"}</div></div></Link>)}</div> : <Empty title="No contacts" />}</Card>
      <TasksPanel where={eq(S.tasks.companyId, id)} back={back} newHref={`/tasks/new?companyId=${id}`} />
    </div></div>
  </>);
}
