import { LiveButton } from "@/components/live-button";
import { isUuid } from "@/lib/normalize";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { computeScore } from "@/lib/scoring";
import { addProjectCompany, addProjectContact, deleteEntity, removeProjectCompany, removeProjectContact, saveScore, setProjectVentures, createResearchSession } from "@/server/actions";
import { findDuplicateProjects } from "@/server/research";
import { refOptions } from "@/server/entities";
import { ActivitiesPanel, AgentButton, SourcesPanel, TasksPanel } from "@/components/panels";
import { DecisionMakers } from "@/components/decision-makers";
import { linkedinCompanySearch, linkedinPeopleSearch } from "@/server/lusha";
import { Badge, Card, DeleteForm, Demo, Empty, Flash, Hint, PageHead, Score, StatusBadge, Val, fmtDate, fmtMoney, Sim } from "@/components/ui";
import { Submit } from "@/components/client";
import { Icon } from "@/components/icons";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [p] = await db.select().from(S.projects).where(eq(S.projects.id, id));
  if (!p) notFound();
  // Everything below depends only on the project row, so fetch it all in parallel.
  const [[sector], [sub], ventures, pv, linkedR, peopleR, oppsR, research, runsR, dups, factors, companies, contacts] = await Promise.all([
    p.sectorId ? db.select().from(S.sectors).where(eq(S.sectors.id, p.sectorId)) : Promise.resolve([] as (typeof S.sectors.$inferSelect)[]),
    p.subSectorId ? db.select().from(S.sectors).where(eq(S.sectors.id, p.subSectorId)) : Promise.resolve([] as (typeof S.sectors.$inferSelect)[]),
    db.select().from(S.ventures).orderBy(S.ventures.sortOrder),
    db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, id)),
    db.execute(sql`select pc.role, pc.notes, c.id, c.name, c.category, c.is_demo from project_companies pc join companies c on c.id = pc.company_id where pc.project_id = ${id} order by pc.role`),
    db.execute(sql`select pc.role, k.id, k.full_name, k.position, k.relationship_status, k.email, k.phone, k.profile_url, k.contact_source, c.name as company from project_contacts pc join contacts k on k.id = pc.contact_id left join companies c on c.id = k.company_id where pc.project_id = ${id}`),
    db.execute(sql`select o.*, v.name as venture, st.name as stage from opportunities o left join ventures v on v.id = o.venture_id left join pipeline_stages st on st.id = o.stage_id where o.project_id = ${id} order by o.created_at`),
    db.select().from(S.researchSessions).where(eq(S.researchSessions.projectId, id)).orderBy(desc(S.researchSessions.createdAt)),
    db.execute(sql`select r.id, r.status, r.summary, r.created_at, r.is_simulated, a.name from agent_runs r join agents a on a.id = r.agent_id where r.target_type = 'project' and r.target_id = ${id} order by r.created_at desc limit 5`),
    findDuplicateProjects(p.name, p.id),
    db.select().from(S.scoringFactors).orderBy(S.scoringFactors.sortOrder),
    refOptions("companies"),
    refOptions("contacts"),
  ]);
  const linked = linkedR.rows as any[], people = peopleR.rows as any[], opps = oppsR.rows as any[], runs = runsR.rows as any[];
  const score = computeScore(factors, p.scoreBreakdown ?? {});
  const back = `/projects/${id}`;
  const roleLabel = (r: string) => C.label(C.COMPANY_CATEGORY, r);
  const byRole = (r: string) => linked.filter((l) => l.role === r).map((l) => l.name).join(", ") || null;

  return (
    <>
      <PageHead title={<>{p.name} <Demo on={p.isDemo} /></>} crumbs={[{ href: "/projects", label: "Projects" }]}
        sub={<span className="row"><StatusBadge value={p.status} opts={C.PROJECT_STATUS} /><StatusBadge value={p.verificationStatus} opts={C.VERIFICATION} /><Score value={p.opportunityScore} /><span className="muted small">Updated {fmtDate(p.updatedAt, true)}</span></span>}
        actions={<>
          <LiveButton projectId={id} live={p.isLive} researching={p.liveResearchStatus === "running" && !!p.liveResearchAt && Date.now() - new Date(p.liveResearchAt).getTime() < 180000} name={p.name} />
          <AgentButton agentKey="research" label="Run Research agent" targetType="project" targetId={id} instruction={`Research ${p.name}`} back={back} />
          <Link className="btn" href={`/opportunities/new?projectId=${id}`}>Add opportunity</Link>
          <Link className="btn primary" href={`/projects/${id}/edit`}><Icon name="edit" />Edit</Link>
        </>} />
      <Flash sp={sp} />
      {dups.length ? <div className="notice warn" style={{ marginBottom: 14 }}>Possible duplicates: {dups.map((d, i) => <span key={d.id}>{i ? ", " : ""}<Link className="link" href={`/projects/${d.id}`}>{d.name}</Link> ({Math.round(d.score * 100)}%)</span>)}</div> : null}

      <div className="split">
        <div className="stack">
          <Card title="Project intelligence">
            <dl className="kv">
              <dt>Project type</dt><dd><Val v={p.projectType} /></dd>
              <dt>Sector</dt><dd><Val v={[sector?.name, sub?.name].filter(Boolean).join(" › ")} /></dd>
              <dt>Location</dt><dd><Val v={[p.address, p.city, p.country].filter(Boolean).join(", ")} /></dd>
              <dt>Developer / owner</dt><dd><Val v={[byRole("developer"), byRole("owner")].filter(Boolean).join(" · ")} unknown="Not confirmed" /></dd>
              <dt>Operator / brand</dt><dd><Val v={[byRole("operator"), p.brand].filter(Boolean).join(" · ")} unknown="Not confirmed" /></dd>
              <dt>Consultants</dt><dd><Val v={[byRole("architect"), byRole("interior_designer"), byRole("consultant"), byRole("project_manager")].filter(Boolean).join(" · ")} unknown="Not confirmed" /></dd>
              <dt>Contractor</dt><dd><Val v={[byRole("main_contractor"), byRole("fitout_contractor")].filter(Boolean).join(" · ")} unknown="Not confirmed" /></dd>
              <dt>Development stage</dt><dd>{C.label(C.DEVELOPMENT_STAGE, p.developmentStage)}</dd>
              <dt>Procurement stage</dt><dd>{C.label(C.PROCUREMENT_STAGE, p.procurementStage)}</dd>
              <dt>Rooms / units</dt><dd><Val v={p.roomsUnits} /></dd>
              <dt>Size</dt><dd><Val v={p.size} /></dd>
              <dt>Estimated value</dt><dd>{p.estimatedValue ? <>{fmtMoney(p.estimatedValue, p.valueCurrency)} <Badge tone={p.valueBasis === "confirmed" ? "good" : p.valueBasis === "estimate" ? "sim" : "info"}>{C.label(C.VALUE_BASIS, p.valueBasis)}</Badge></> : <span className="unknown">Unknown</span>}</dd>
              <dt>Announced</dt><dd><Val v={fmtDate(p.announcementDate)} /></dd>
              <dt>Expected completion</dt><dd><Val v={p.expectedCompletion} /></dd>
              <dt>Procurement packages</dt><dd className="pre"><Val v={p.procurementPackages} unknown="Not identified" /></dd>
            </dl>
            {p.description ? <><hr className="sep" /><div className="pre">{p.description}</div></> : null}
            {p.researchNotes ? <><hr className="sep" /><h3 style={{ marginBottom: 6 }}>Research notes</h3><div className="pre small" style={{ color: "var(--text-2)" }}>{p.researchNotes}</div></> : null}
          </Card>

          <Card title="Stakeholder companies" tight>
            {linked.length ? <div className="list">{linked.map((l) => (
              <div key={l.id + l.role} className="li">
                <div className="grow"><Link className="ttl link" href={`/companies/${l.id}`}>{l.name}</Link> <Demo on={l.is_demo} /><div className="meta">{roleLabel(l.role)}{l.notes ? ` · ${l.notes}` : ""} · <a className="link" href={linkedinCompanySearch(l.name)} target="_blank" rel="noopener noreferrer">LinkedIn</a></div></div>
                <form action={removeProjectCompany.bind(null, id, l.id, l.role)}><button className="btn ghost sm">Unlink</button></form>
              </div>))}</div> : <Empty title="No companies linked">Link the developer, operator, designers and contractors as they are confirmed.</Empty>}
            <form action={addProjectCompany.bind(null, id)} className="row" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <select name="role" style={{ width: "auto" }}>{C.PROJECT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
              <select name="companyId" style={{ width: "auto", flex: 1 }}><option value="">Existing company…</option>{companies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              <input name="newCompanyName" placeholder="…or new company name" style={{ width: "auto", flex: 1 }} />
              <Submit className="btn sm">Link</Submit>
            </form>
          </Card>

          <DecisionMakers projectId={id} />

          <Card title="Deals (CRM)" sub="Go live opens one deal per linked venture. Close them as won or lost on the CRM page." tight actions={<Link className="btn sm" href={`/opportunities/new?projectId=${id}`}>Add</Link>}>
            {opps.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Opportunity</th><th>Venture</th><th>Stage</th><th>Priority</th><th>Next action</th></tr></thead><tbody>
              {opps.map((o) => <tr key={o.id}><td><Link className="title" href={`/opportunities/${o.id}`}>{o.title}</Link></td><td>{o.venture ?? "—"}</td><td>{o.stage ?? C.label(C.COMMERCIAL_STATUS, o.commercial_status)}</td><td><StatusBadge value={o.priority} opts={C.PRIORITY} /></td><td className="small"><Val v={o.next_action} unknown="None set" /></td></tr>)}
            </tbody></table></div> : <Empty title="No opportunities yet" />}
          </Card>

          <SourcesPanel target={{ projectId: id }} back={back} />

          <Card title="Research" tight actions={<form action={createResearchSession}><input type="hidden" name="kind" value="project" /><input type="hidden" name="projectId" value={id} /><Submit className="btn sm">New research session</Submit></form>}>
            {research.length || runs.length ? <div className="list">
              {research.map((r) => <Link key={r.id} href={`/research/${r.id}`} className="li"><div className="grow"><div className="ttl">{r.title}</div><div className="meta">{C.label(C.RESEARCH_KIND, r.kind)} · {fmtDate(r.createdAt)} · {r.provider}</div></div><StatusBadge value={r.status === "open" ? "in_progress" : r.status} opts={C.TASK_STATUS.concat(C.RUN_STATUS)} /></Link>)}
              {runs.map((r) => <Link key={r.id} href={`/agents/runs/${r.id}`} className="li"><div className="grow"><div className="ttl">{r.name}</div><div className="meta">{r.summary}</div></div><Sim on={r.is_simulated} /><StatusBadge value={r.status} opts={C.RUN_STATUS} /></Link>)}
            </div> : <Empty title="No research yet">Open a structured research session or run the Research agent.</Empty>}
          </Card>

          <TasksPanel where={eq(S.tasks.projectId, id)} back={back} newHref={`/tasks/new?projectId=${id}`} />
          <ActivitiesPanel where={eq(S.activities.projectId, id)} newHref={`/activities/new?projectId=${id}`} />
        </div>

        <div className="stack">
          <Card title="Relevant ventures" sub="Tick every business this project could matter to, and note why (scope, package). One project can serve several ventures.">
            <form action={setProjectVentures.bind(null, id)} className="stack" style={{ gap: 10 }}>
              {ventures.map((v) => { const link = pv.find((x) => x.ventureId === v.id); return (
                <div key={v.id} className="stack" style={{ gap: 4 }}>
                  <label className="check"><input type="checkbox" name="ventureId" value={v.id} defaultChecked={!!link} /> {v.name}{!v.servicesConfirmed ? <span className="faint small"> (services tbc)</span> : null}</label>
                  <input name={`relevance_${v.id}`} defaultValue={link?.relevance ?? ""} placeholder="Why relevant (scope, package)…" style={{ fontSize: 12 }} />
                </div>); })}
              <Submit className="btn sm">Save relevance</Submit>
            </form>
          </Card>

          <Card title="Opportunity score" sub="Each factor is rated 0–5 and multiplied by its weight, then scaled to 100. Edit factors and weights in Settings → Research & scoring." id="score">
            <form action={saveScore.bind(null, id)} className="stack" style={{ gap: 8 }}>
              {score.rows.map((f) => (
                <div key={f.key} className="row" style={{ justifyContent: "space-between" }} title={f.description ?? ""}>
                  <span className="small row" style={{ gap: 6 }}>{f.label} <span className="faint">×{f.weight}</span>{f.description ? <Hint text={`${f.description} Rate 0–5; weight ×${f.weight}.`} /> : null}</span>
                  <select name={`f_${f.key}`} defaultValue={f.rated ? String(f.rating) : ""} style={{ width: 74 }}>
                    <option value="">–</option>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>))}
              <div className="row" style={{ justifyContent: "space-between" }}><strong>Score</strong><Score value={p.opportunityScore} /></div>
              <textarea name="scoreNotes" placeholder="Reasoning behind the ratings" defaultValue={p.scoreNotes ?? ""} />
              <Submit className="btn sm">Save score</Submit>
              {!score.complete && score.ratedCount ? <span className="muted small">{score.ratedCount}/{factors.length} factors rated — unrated count as 0.</span> : null}
            </form>
          </Card>

          <Card title="People" sub="Contacts linked to this project, with phone and email when known. Revealed Lusha contacts land here automatically." tight>
            {people.length ? <div className="list">{people.map((c) => (
              <div key={c.id} className="li"><div className="grow"><Link className="ttl link" href={`/contacts/${c.id}`}>{c.full_name}</Link><div className="meta">{[c.position, c.company].filter(Boolean).join(" · ")}</div>
                  <div className="row small" style={{ gap: 10, marginTop: 4 }}>
                    {c.phone ? <a className="link" href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a> : null}
                    {c.email ? <a className="link" href={`mailto:${c.email}`}>{c.email}</a> : null}
                    {!c.phone && !c.email ? <span className="faint">No phone or email yet</span> : null}
                    <a className="link" href={c.profile_url ?? linkedinPeopleSearch(c.full_name, c.company)} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                  </div></div>
                <form action={removeProjectContact.bind(null, id, c.id)}><button className="btn ghost sm" title="Unlink">×</button></form></div>))}</div> : <Empty title="No contacts linked">Use Decision-makers above to find and reveal people.</Empty>}
            <form action={addProjectContact.bind(null, id)} className="row" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <select name="contactId" style={{ flex: 1 }}><option value="">Choose contact…</option>{contacts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              <input name="role" placeholder="Role on project" style={{ flex: 1 }} />
              <Submit className="btn sm">Link</Submit>
            </form>
          </Card>

          <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "projects", id)} label="Delete project" back="/projects" /> <Hint text="Opportunities and tasks are kept but unlinked. A full snapshot is stored in the audit log so it can be recovered." />
            </Card>
        </div>
      </div>
    </>
  );
}

