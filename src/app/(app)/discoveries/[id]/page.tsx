import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { deleteEntity, linkDiscovery, promoteDiscovery, setDiscoveryStatus } from "@/server/actions";
import { findDuplicateDiscoveries, findDuplicateProjects } from "@/server/research";
import { refOptions } from "@/server/entities";
import { AgentButton, SourcesPanel } from "@/components/panels";
import { Card, DeleteForm, Demo, Empty, Flash, InfoBadge, PageHead, StatusBadge, Val, fmtDate, Sim } from "@/components/ui";
import { Submit } from "@/components/client";

export default async function DiscoveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [d] = await db.select().from(S.discoveries).where(eq(S.discoveries.id, id));
  if (!d) notFound();
  const [sector] = d.sectorId ? await db.select().from(S.sectors).where(eq(S.sectors.id, d.sectorId)) : [];
  const dupProjects = await findDuplicateProjects(d.title);
  const dupDisc = await findDuplicateDiscoveries(d.title, d.url, d.id);
  const ventures = await db.select().from(S.ventures).where(eq(S.ventures.active, true)).orderBy(S.ventures.sortOrder);
  const projects = await refOptions("projects");
  const back = `/discoveries/${id}`;
  const suggested = new Set(d.suggestedVentureIds ?? []);
  return (<>
    <PageHead title={<>{d.title} <Demo on={d.isDemo} /></>} crumbs={[{ href: "/discoveries", label: "Discoveries" }]}
      sub={<span className="row"><StatusBadge value={d.status} opts={C.DISCOVERY_STATUS} /><InfoBadge value={d.infoStatus} /><Sim on={d.isSimulated} /><span className="muted small">Found {fmtDate(d.createdAt, true)}</span></span>}
      actions={<AgentButton agentKey="business_development" label="Suggest ventures" instruction="Route new discoveries" back={back} />} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      <Card title="What was found"><dl className="kv">
        <dt>Type</dt><dd>{C.label(C.DISCOVERY_KIND, d.kind)}</dd>
        <dt>Source</dt><dd>{d.url ? <a className="link" href={d.url} target="_blank" rel="noopener noreferrer">{d.sourceName ?? d.url}</a> : <Val v={d.sourceName} unknown="No source URL — needs verification" />}</dd>
        <dt>Published</dt><dd><Val v={fmtDate(d.publishedAt)} /></dd><dt>Sector</dt><dd><Val v={sector?.name} /></dd><dt>Location</dt><dd><Val v={d.location} /></dd>
        <dt>Developer (reported)</dt><dd><Val v={d.developerName} /></dd><dt>Operator (reported)</dt><dd><Val v={d.operatorName} /></dd>
        <dt>Summary</dt><dd className="pre"><Val v={d.summary} unknown="—" /></dd>
        {d.routingNotes ? <><dt>Routing notes</dt><dd className="small">{d.routingNotes}</dd></> : null}
        {d.rejectionReason ? <><dt>Rejected because</dt><dd>{d.rejectionReason}</dd></> : null}
      </dl>
      {d.aiGenerated ? <div className="notice sim" style={{ marginTop: 10 }}>This summary was AI-generated. Treat it as unverified until checked against the source.</div> : null}</Card>
      <Card title="Possible duplicates" tight>
        {dupProjects.length || dupDisc.length ? <div className="list">
          {dupProjects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="li"><div className="grow"><div className="ttl">Project: {p.name}</div><div className="meta">{Math.round(p.score * 100)}% name similarity · {C.label(C.PROJECT_STATUS, p.status)}</div></div></Link>)}
          {dupDisc.map((x) => <Link key={x.id} href={`/discoveries/${x.id}`} className="li"><div className="grow"><div className="ttl">Discovery: {x.title}</div><div className="meta">{Math.round(x.score * 100)}% similar · {C.label(C.DISCOVERY_STATUS, x.status)}</div></div></Link>)}
        </div> : <Empty title="No duplicates detected">Checked by normalised URL and name similarity.</Empty>}
      </Card>
      <SourcesPanel target={{ discoveryId: id }} back={back} />
    </div><div className="stack">
      {d.status !== "saved" ? <>
        <Card title="Save as new project">
          <form action={promoteDiscovery.bind(null, id)} className="stack" style={{ gap: 8 }}>
            <div className="field"><label>Project name</label><input name="name" defaultValue={d.title.replace(/^\[DEMO\]\s*/, "").slice(0, 120)} required /></div>
            <span className="lbl-s">Relevant ventures</span>
            {ventures.map((v) => <label key={v.id} className="check"><input type="checkbox" name="ventureId" value={v.id} defaultChecked={suggested.has(v.id)} /> {v.name}{suggested.has(v.id) ? <span className="faint small"> (suggested)</span> : null}</label>)}
            <Submit>Save as project</Submit>
            <span className="muted small">The source URL is attached as evidence. Reported facts stay “unverified”.</span>
          </form>
        </Card>
        <Card title="…or add as evidence to an existing project">
          <form action={linkDiscovery.bind(null, id)} className="row"><select name="projectId" style={{ flex: 1 }} defaultValue={dupProjects[0]?.id ?? ""}><option value="">Choose project…</option>{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select><Submit className="btn sm">Link</Submit></form>
        </Card>
        <Card title="Review">
          <div className="stack" style={{ gap: 8 }}>
            {d.status !== "needs_verification" ? <form action={setDiscoveryStatus.bind(null, id, "needs_verification")}><Submit className="btn">Flag: needs verification</Submit></form> : <form action={setDiscoveryStatus.bind(null, id, "new")}><Submit className="btn">Clear flag</Submit></form>}
            {d.status !== "rejected" ? <form action={setDiscoveryStatus.bind(null, id, "rejected")} className="row"><input name="reason" placeholder="Reason (optional)" style={{ flex: 1 }} /><Submit className="btn danger">Reject</Submit></form>
              : <form action={setDiscoveryStatus.bind(null, id, "new")}><Submit className="btn">Reopen</Submit></form>}
          </div>
        </Card>
      </> : <Card title="Saved">{d.projectId ? <Link className="btn primary" href={`/projects/${d.projectId}`}>Open project</Link> : null}</Card>}
      <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "discoveries", id)} back="/discoveries" /></Card>
    </div></div>
  </>);
}
