import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { ActivitiesPanel, AgentButton, SourcesPanel, TasksPanel } from "@/components/panels";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val } from "@/components/ui";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [k] = await db.select().from(S.contacts).where(eq(S.contacts.id, id));
  if (!k) notFound();
  const [co] = k.companyId ? await db.select().from(S.companies).where(eq(S.companies.id, k.companyId)) : [];
  const projects = (await db.execute(sql`select p.id, p.name, pc.role from project_contacts pc join projects p on p.id = pc.project_id where pc.contact_id = ${id}`)).rows as any[];
  const opps = (await db.execute(sql`select o.id, o.title, o.commercial_status from opportunity_contacts oc join opportunities o on o.id = oc.opportunity_id where oc.contact_id = ${id}`)).rows as any[];
  const back = `/contacts/${id}`;
  return (<>
    <PageHead title={<>{k.fullName} <Demo on={k.isDemo} /></>} crumbs={[{ href: "/contacts", label: "Contacts" }]} sub={<span className="row">{k.position ?? "Position unknown"}{co ? <> · <Link className="link" href={`/companies/${co.id}`}>{co.name}</Link></> : null}<StatusBadge value={k.relationshipStatus} opts={C.RELATIONSHIP_STATUS} /></span>}
      actions={<>{k.relationshipStatus !== "do_not_contact" ? <AgentButton agentKey="outreach" label="Draft outreach" targetType="contact" targetId={id} instruction={`Introduce our services to ${k.fullName}`} back={back} /> : null}<Link className="btn primary" href={`/contacts/${id}/edit`}>Edit</Link></>} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      <Card title="Contact details"><dl className="kv">
        <dt>Email</dt><dd><Val v={k.email} unknown="Not on file" /></dd><dt>Phone</dt><dd><Val v={k.phone} unknown="Not on file" /></dd>
        <dt>Profile</dt><dd>{k.profileUrl ? <a className="link" href={k.profileUrl} target="_blank" rel="noopener noreferrer">{k.profileUrl}</a> : <span className="unknown">Not on file</span>}</dd>
        <dt>Source of contact</dt><dd><Val v={k.contactSource} /></dd><dt>Verification</dt><dd><StatusBadge value={k.verificationStatus} opts={C.VERIFICATION} /></dd>
        <dt>Notes</dt><dd className="pre"><Val v={k.notes} unknown="—" /></dd></dl></Card>
      <SourcesPanel target={{ contactId: id }} back={back} />
      <ActivitiesPanel where={eq(S.activities.contactId, id)} newHref={`/activities/new?contactId=${id}`} />
    </div><div className="stack">
      <Card title="Projects" tight>{projects.length ? <div className="list">{projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="li"><div className="grow"><div className="ttl">{p.name}</div><div className="meta">{p.role ?? ""}</div></div></Link>)}</div> : <Empty title="No linked projects" />}</Card>
      <Card title="Opportunities" tight>{opps.length ? <div className="list">{opps.map((o) => <Link key={o.id} href={`/opportunities/${o.id}`} className="li"><div className="grow ttl">{o.title}</div><StatusBadge value={o.commercial_status} opts={C.COMMERCIAL_STATUS} /></Link>)}</div> : <Empty title="No linked opportunities" />}</Card>
      <TasksPanel where={eq(S.tasks.contactId, id)} back={back} newHref={`/tasks/new?contactId=${id}`} />
    </div></div>
  </>);
}
