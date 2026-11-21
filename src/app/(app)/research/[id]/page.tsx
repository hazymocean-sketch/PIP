import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { DISCOVERY_FIELDS } from "@/lib/fields";
import { addDiscovery, saveResearchSession } from "@/server/actions";
import { manualSearchLinks, PILOT_SOURCES } from "@/server/research";
import { loadRefOptions } from "@/server/entities";
import { SourcesPanel } from "@/components/panels";
import { FormFields } from "@/components/fields";
import { Submit } from "@/components/client";
import { Card, Demo, Empty, Flash, InfoBadge, PageHead, StatusBadge, fmtDate } from "@/components/ui";

export default async function Session({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [s] = await db.select().from(S.researchSessions).where(eq(S.researchSessions.id, id));
  if (!s) notFound();
  const [p] = s.projectId ? await db.select().from(S.projects).where(eq(S.projects.id, s.projectId)) : [];
  const [c] = s.companyId ? await db.select().from(S.companies).where(eq(S.companies.id, s.companyId)) : [];
  const found = await db.select().from(S.discoveries).where(eq(S.discoveries.researchSessionId, id));
  const queries = (s.query ?? "").split("\n").map((q) => q.trim()).filter(Boolean);
  const searchQueries = s.kind === "discovery" ? queries : [p ? `"${p.name}" ${p.city ?? "UAE"}` : c ? `"${c.name}" UAE projects` : queries[0]].filter(Boolean) as string[];
  const refs = await loadRefOptions(DISCOVERY_FIELDS);
  const back = `/research/${id}`;
  return (<>
    <PageHead title={<>{s.title} <Demo on={s.isDemo} /></>} crumbs={[{ href: "/research", label: "Research Center" }]}
      sub={<span className="row"><span>{C.label(C.RESEARCH_KIND, s.kind)}</span><StatusBadge value={s.status === "open" ? "in_progress" : s.status} opts={[...C.TASK_STATUS, ...C.RUN_STATUS]} /><span className="muted small">Provider: {s.provider} · started {fmtDate(s.createdAt, true)}</span></span>}
      actions={<>{p ? <Link className="btn" href={`/projects/${p.id}`}>Open project</Link> : null}{c ? <Link className="btn" href={`/companies/${c.id}`}>Open company</Link> : null}</>} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      {s.checklist?.length ? <Card title="Research checklist" sub="Answer what you can. Mark the basis for each answer.">
        <form action={saveResearchSession.bind(null, id)} className="stack" style={{ gap: 12 }}>
          {s.checklist.map((item, i) => (
            <div key={i} className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><label className="lbl-s" htmlFor={`a_${i}`}>{item.q}</label>{item.answer ? <InfoBadge value={item.basis ?? "unknown"} /> : null}</div>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <textarea id={`a_${i}`} name={`a_${i}`} defaultValue={item.answer ?? ""} style={{ minHeight: 44, flex: 1 }} placeholder="Unknown" />
                <select name={`b_${i}`} defaultValue={item.basis ?? "unknown"} style={{ width: 150 }}>{C.INFO_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label.split(" —")[0]}</option>)}</select>
              </div>
            </div>))}
          <div className="field"><label>Research report / summary</label><textarea name="report" defaultValue={s.report ?? ""} style={{ minHeight: 140 }} /></div>
          <div className="form-foot" style={{ justifyContent: "space-between" }}><label className="check"><input type="checkbox" name="status" value="completed" defaultChecked={s.status === "completed"} /> Mark research completed</label><Submit>Save research</Submit></div>
        </form>
      </Card> : <Card title="Report"><form action={saveResearchSession.bind(null, id)} className="stack"><textarea name="report" defaultValue={s.report ?? ""} style={{ minHeight: 120 }} placeholder="Notes and conclusions" /><div className="row"><label className="check"><input type="checkbox" name="status" value="completed" defaultChecked={s.status === "completed"} /> Completed</label><span className="spacer" /><Submit>Save</Submit></div></form></Card>}

      <Card title={`Results found (${found.length})`} tight actions={<Link className="btn ghost sm" href="/discoveries">All discoveries</Link>}>
        {found.length ? <div className="list">{found.map((d) => <Link key={d.id} href={`/discoveries/${d.id}`} className="li"><div className="grow"><div className="ttl">{d.title}</div><div className="meta">{d.sourceName ?? "—"} · {fmtDate(d.publishedAt) ?? "date unknown"}</div></div><StatusBadge value={d.status} opts={C.DISCOVERY_STATUS} /></Link>)}</div>
          : <Empty title="No results captured yet">{s.provider === "manual" ? "Use the search links, then add each relevant finding below." : "The provider returned no new results."}</Empty>}
        <details style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}><summary>Add a finding from this research</summary>
          <form action={addDiscovery} style={{ marginTop: 10 }}><input type="hidden" name="researchSessionId" value={id} /><input type="hidden" name="_back" value={back} />
            <FormFields fields={DISCOVERY_FIELDS} refs={refs} values={{ infoStatus: "reported", kind: "project", sectorId: s.sectorId, location: s.location }} /><div className="form-foot"><Submit>Add finding</Submit></div></form></details>
      </Card>
      <SourcesPanel target={{ researchSessionId: id }} back={back} />
    </div><div className="stack">
      <Card title="Search links" sub={s.provider === "manual" ? "Manual mode — open in a new tab" : "Re-check sources manually"}>
        <div className="stack" style={{ gap: 12 }}>
          {searchQueries.slice(0, 10).map((q) => (
            <div key={q}><div className="small" style={{ marginBottom: 4 }}><code>{q}</code></div>
              <div className="row" style={{ gap: 6 }}>{manualSearchLinks(q).slice(0, 4).map((l) => <a key={l.url} className="btn sm" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}</div></div>))}
        </div>
      </Card>
      <Card title="Pilot sources" sub="Hotels & resorts monitoring list"><div className="stack" style={{ gap: 4 }}>{PILOT_SOURCES.map((x) => <a key={x.domain} className="link small" href={`https://${x.domain}`} target="_blank" rel="noopener noreferrer">{x.name}</a>)}</div></Card>
      {s.query && s.kind !== "discovery" ? <Card title="Question"><div className="pre small">{s.query}</div></Card> : null}
    </div></div>
  </>);
}
