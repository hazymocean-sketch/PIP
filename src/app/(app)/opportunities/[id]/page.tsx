import { isUuid } from "@/lib/normalize";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { addOpportunityContact, removeOpportunityContact } from "@/server/actions";
import { refOptions } from "@/server/entities";
import { ActivitiesPanel, AgentButton, SourcesPanel, TasksPanel } from "@/components/panels";
import { Card, Demo, Empty, Flash, PageHead, StatusBadge, Val, fmtDate, fmtMoney } from "@/components/ui";
import { Submit } from "@/components/client";
import { Icon } from "@/components/icons";
import { DecisionMakers } from "@/components/decision-makers";

export default async function OppPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [o] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, id));
  if (!o) notFound();
  const [[p], [v], [st], dmsR, contacts] = await Promise.all([
    o.projectId ? db.select().from(S.projects).where(eq(S.projects.id, o.projectId)) : Promise.resolve([] as (typeof S.projects.$inferSelect)[]),
    o.ventureId ? db.select().from(S.ventures).where(eq(S.ventures.id, o.ventureId)) : Promise.resolve([] as (typeof S.ventures.$inferSelect)[]),
    o.stageId ? db.select().from(S.pipelineStages).where(eq(S.pipelineStages.id, o.stageId)) : Promise.resolve([] as (typeof S.pipelineStages.$inferSelect)[]),
    db.execute(sql`select k.id, k.full_name, k.position, k.email, c.name as company from opportunity_contacts oc join contacts k on k.id = oc.contact_id left join companies c on c.id = k.company_id where oc.opportunity_id = ${id}`),
    refOptions("contacts"),
  ]);
  const dms = dmsR.rows as any[];
  const back = `/opportunities/${id}`;
  return (<>
    <PageHead title={<>{o.title} <Demo on={o.isDemo} /></>} crumbs={[{ href: "/opportunities", label: "Opportunities" }]}
      sub={<span className="row"><span>{v?.name ?? "No venture"}</span><StatusBadge value={o.qualificationStatus} opts={C.QUALIFICATION_STATUS} /><StatusBadge value={o.commercialStatus} opts={C.COMMERCIAL_STATUS} /><StatusBadge value={o.priority} opts={C.PRIORITY} /></span>}
      actions={<><AgentButton agentKey="outreach" label="Draft outreach" targetType="opportunity" targetId={id} instruction={o.nextAction ?? "Introduce our services for this opportunity"} ventureId={o.ventureId} back={back} />
        <Link className="btn primary" href={`/opportunities/${id}/edit`}><Icon name="edit" />Edit</Link></>} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      <Card title="Opportunity"><dl className="kv">
        <dt>Project</dt><dd>{p ? <Link className="link" href={`/projects/${p.id}`}>{p.name}</Link> : <span className="unknown">Not linked</span>}</dd>
        <dt>Venture</dt><dd><Val v={v?.name} unknown="Not set" /></dd><dt>Pipeline stage</dt><dd><Val v={st?.name} unknown="Not set" /></dd>
        <dt>Type</dt><dd><Val v={o.opportunityType} /></dd><dt>Potential scope</dt><dd className="pre"><Val v={o.scope} /></dd>
        <dt>Estimated value</dt><dd><Val v={fmtMoney(o.estimatedValue, o.valueCurrency)} /></dd>
        <dt>Next action</dt><dd><Val v={o.nextAction} unknown="None set" /></dd><dt>Follow-up</dt><dd><Val v={fmtDate(o.followUpDate)} unknown="Not scheduled" /></dd>
        <dt>Decision-makers (to identify)</dt><dd className="pre"><Val v={o.decisionMakers} unknown="—" /></dd><dt>Notes</dt><dd className="pre"><Val v={o.notes} unknown="—" /></dd>
      </dl></Card>
      {p ? <DecisionMakers projectId={p.id} opportunityId={id} />
        : <Card id="decision-makers" title="Find decision-makers"><div className="card-b"><div className="notice">Link this opportunity to a project (Edit → Project) to search Lusha for decision-makers. Lusha and LinkedIn only work on pipeline projects.</div></div></Card>}
      <SourcesPanel target={{ opportunityId: id }} back={back} />
      <ActivitiesPanel where={eq(S.activities.opportunityId, id)} newHref={`/activities/new?opportunityId=${id}`} />
    </div><div className="stack">
      <Card title="Contacts on this deal" sub="Verified contacts linked to this opportunity. People you reveal with Lusha are added here automatically." tight>
        {dms.length ? <div className="list">{dms.map((c) => <div key={c.id} className="li"><div className="grow"><Link className="ttl link" href={`/contacts/${c.id}`}>{c.full_name}</Link><div className="meta">{[c.position, c.company].filter(Boolean).join(" · ")}{c.email ? "" : " · no email on file"}</div></div>
          <form action={removeOpportunityContact.bind(null, id, c.id)}><button className="btn ghost sm">×</button></form></div>)}</div> : <Empty title="None linked" />}
        <form action={addOpportunityContact.bind(null, id)} className="row" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
          <select name="contactId" style={{ flex: 1 }}><option value="">Choose contact…</option>{contacts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select><Submit className="btn sm">Link</Submit></form>
      </Card>
      <TasksPanel where={eq(S.tasks.opportunityId, id)} back={back} newHref={`/tasks/new?opportunityId=${id}`} />
      {v?.qualificationCriteria ? <Card title={`${v.name} qualification criteria`}><div className="small pre muted">{v.qualificationCriteria}</div></Card> : null}
    </div></div>
  </>);
}
