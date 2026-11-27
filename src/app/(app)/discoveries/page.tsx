import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { DISCOVERY_FIELDS } from "@/lib/fields";
import { deleteDiscoveriesAction, deleteSearchRunAction } from "@/server/actions";
import { filterQs, filterWhere, parseFilter } from "@/server/discovery-list";
import { BulkBar, ConfirmButton, RunPicker } from "@/components/discovery-client";
import { Icon } from "@/components/icons";
import { DiscoveryRunner } from "@/components/discovery-runner";
import { loadRefOptions } from "@/server/entities";
import { getSearchProvider } from "@/server/ai/providers";
import { FormFields } from "@/components/fields";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Empty, Flash, InfoBadge, PageHead, StatusBadge, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Discoveries" };
export default async function Discoveries({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const f = parseFilter(sp); const status = f.status; const qs = filterQs(f);
  const where = filterWhere(f);
  const listUrl = `/discoveries${qs}`;
  const runQs = (s: string) => (f.run ? `${s === "review" ? "?" : "&"}run=${f.run}` : "");
  const [rowsR, countsR, runsR, runR] = await Promise.all([db.execute(sql`select d.*, s.name as sector, p.name as project,
      (select string_agg(v.name, ', ') from ventures v where d.suggested_venture_ids ? v.id::text) as suggested,
      (select p2.name from projects p2 where similarity(p2.normalized_name, d.normalized_title) > 0.35 or d.normalized_title like '%' || p2.normalized_name || '%' order by similarity(p2.normalized_name, d.normalized_title) desc limit 1) as possible_dup
    from discoveries d left join sectors s on s.id = d.sector_id left join projects p on p.id = d.project_id where ${where} order by d.created_at desc, d.id desc limit 300`),
    db.execute(sql`select status, count(*)::int as n from discoveries d where ${f.run ? sql`d.research_session_id = ${f.run}` : sql`true`} group by status`),
    db.execute(sql`select r.id, r.title, r.created_at, count(d.id)::int as n from research_sessions r join discoveries d on d.research_session_id = r.id where r.kind = 'discovery' group by r.id order by r.created_at desc limit 40`),
    f.run ? db.execute(sql`select r.id, r.title, r.created_at, count(d.id)::int as n, count(d.id) filter (where d.status = 'saved')::int as saved from research_sessions r left join discoveries d on d.research_session_id = r.id where r.id = ${f.run} group by r.id`) : Promise.resolve({ rows: [] }),
  ]);
  const rows = rowsR.rows as any[];
  const counts = countsR.rows as { status: string; n: number }[];
  const runs = (runsR.rows as { id: string; title: string; created_at: string; n: number }[]).map((r) => ({ id: r.id, label: `${fmtDate(r.created_at, true)} · ${r.title} (${r.n})` }));
  const run = runR.rows[0] as { id: string; title: string; created_at: string; n: number; saved: number } | undefined;
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const refs = await loadRefOptions(DISCOVERY_FIELDS);
  const provider = getSearchProvider();
  return (<>
    <PageHead title="Discover" sub="Find potential projects, review the evidence, then save, link, flag or reject. Nothing becomes a project without your review." />
    <Flash sp={sp} />
    <div style={{ marginBottom: 14 }}>
      <Card title="Run a discovery search" sub={provider ? `Automated via ${provider.label}. Results land in the review list below.` : "Manual mode — no search API connected yet. PIP prepares the query set and one-click search links; you open them and add what you find. Nothing is fabricated."}>
        <DiscoveryRunner sectors={refs.sectors ?? []} locations={C.LOCATIONS} providerLabel={provider?.label ?? null} />
      </Card>
    </div>
    <Tabs active={{ review: "To review", needs_verification: "Needs verification", saved: "Saved", rejected: "Rejected", all: "All" }[status] ?? "To review"} items={[
      { href: `/discoveries${runQs("review")}`, label: "To review", count: n("new") + n("needs_verification") }, { href: `/discoveries?status=needs_verification${runQs("x")}`, label: "Needs verification", count: n("needs_verification") },
      { href: `/discoveries?status=saved${runQs("x")}`, label: "Saved", count: n("saved") }, { href: `/discoveries?status=rejected${runQs("x")}`, label: "Rejected", count: n("rejected") }, { href: `/discoveries?status=all${runQs("x")}`, label: "All" }]} />
    <div className="run-bar">
      <RunPicker runs={runs} value={f.run} status={status} />
      {run ? <>
        <span className="muted small">{run.n} found{run.saved ? ` · ${run.saved} saved (kept if you delete)` : ""}</span>
        {run.n - run.saved > 0 ? <form action={deleteSearchRunAction.bind(null, run.id)}><ConfirmButton message={`Delete all ${run.n - run.saved} unsaved discoveries from "${run.title}"? Saved ones are kept.`}><Icon name="trash" />Delete this search&apos;s results</ConfirmButton></form> : null}
        <Link className="btn sm" href={`/discoveries${status !== "review" ? `?status=${status}` : ""}`}>Show all searches</Link>
      </> : null}
    </div>
    <form id="bulk" action={deleteDiscoveriesAction}><input type="hidden" name="_back" value={listUrl} /></form>
    <Card tight>{rows.length ? <><BulkBar formId="bulk" /><div className="list">{rows.map((d) => (
      <div key={d.id} className="li li-check">
        {d.status !== "saved" ? <input type="checkbox" name="id" value={d.id} form="bulk" aria-label={`Select ${d.title}`} /> : <span style={{ width: 16, flex: "none" }} title="Saved — kept" />}
        <Link href={`/discoveries/${d.id}${qs}`}>
        <div className="grow">
          <div className="ttl">{d.title} <Demo on={d.is_demo} /></div>
          <div className="meta">{C.label(C.DISCOVERY_KIND, d.kind)} · {d.source_name ?? "No source"} · {fmtDate(d.published_at) ?? "date unknown"}{d.location ? ` · ${d.location}` : ""}{d.sector ? ` · ${d.sector}` : ""}</div>
          {d.suggested ? <div className="small" style={{ marginTop: 3 }}>Suggested for: {d.suggested}</div> : null}
          {d.possible_dup && d.status !== "saved" ? <div className="small" style={{ marginTop: 3, color: "var(--amber)" }}>Possible duplicate of: {d.possible_dup}</div> : null}
        </div>
        <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}><StatusBadge value={d.status} opts={C.DISCOVERY_STATUS} /><InfoBadge value={d.info_status} />{d.ai_generated ? <Badge tone="sim">AI-generated</Badge> : null}</div>
      </Link></div>))}</div></> : <Empty title="Nothing to review">Run a discovery search or add one manually.</Empty>}</Card>
  </>);
}
