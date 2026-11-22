import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { DISCOVERY_FIELDS } from "@/lib/fields";
import { addDiscovery, runDiscoveryAction } from "@/server/actions";
import { loadRefOptions } from "@/server/entities";
import { getSearchProvider } from "@/server/ai/providers";
import { FormFields } from "@/components/fields";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Empty, Flash, InfoBadge, PageHead, StatusBadge, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Discoveries" };
export default async function Discoveries({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = sp.status ?? "review";
  const where = status === "review" ? sql`d.status in ('new','needs_verification')` : status === "all" ? sql`true` : sql`d.status = ${status}`;
  const rows = (await db.execute(sql`select d.*, s.name as sector, p.name as project,
      (select string_agg(v.name, ', ') from ventures v where d.suggested_venture_ids ? v.id::text) as suggested,
      (select p2.name from projects p2 where similarity(p2.normalized_name, d.normalized_title) > 0.35 or d.normalized_title like '%' || p2.normalized_name || '%' order by similarity(p2.normalized_name, d.normalized_title) desc limit 1) as possible_dup
    from discoveries d left join sectors s on s.id = d.sector_id left join projects p on p.id = d.project_id where ${where} order by d.created_at desc limit 300`)).rows as any[];
  const counts = (await db.execute(sql`select status, count(*)::int as n from discoveries group by status`)).rows as { status: string; n: number }[];
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const refs = await loadRefOptions(DISCOVERY_FIELDS);
  const provider = getSearchProvider();
  return (<>
    <PageHead title="Discover" sub="Find potential projects, review the evidence, then save, link, flag or reject. Nothing becomes a project without your review." />
    <Flash sp={sp} />
    <div className="grid g2" style={{ marginBottom: 14 }}>
      <Card title="Run a discovery search" sub={provider ? `Automated via ${provider.label}. Results land in the review list below.` : "Manual mode — no search API connected yet. PIP prepares the query set and one-click search links; you open them and add what you find. Nothing is fabricated."}>
        <form action={runDiscoveryAction} className="stack" style={{ gap: 10 }}>
          <div className="fields">
            <div className="field wide"><label>Research query (optional)</label><input name="query" placeholder="e.g. new beach resort Al Marjan Island" /></div>
            <div className="field"><label>Template</label><select name="template" defaultValue="hotels"><option value="hotels">Hotels &amp; resorts pilot (8 queries)</option><option value="custom">Only my query</option></select></div>
            <div className="field"><label>Sector</label><select name="sectorId"><option value="">Any</option>{refs.sectors?.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            <div className="field"><label>Location</label><input name="location" list="disc-locs" placeholder="UAE" /><datalist id="disc-locs">{C.LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist></div>
            <div className="field"><label>Published from</label><input type="date" name="dateFrom" /></div>
          </div>
          <div className="row"><Submit>Run discovery</Submit></div>
        </form>
      </Card>
      <Card title="Add a discovery manually" sub="Paste a lead from an article, contact or site visit">
        <details><summary>Open form</summary>
          <form action={addDiscovery} style={{ marginTop: 10 }}><FormFields fields={DISCOVERY_FIELDS} refs={refs} values={{ infoStatus: "reported", kind: "project" }} /><div className="form-foot"><Submit>Add discovery</Submit></div></form>
        </details>
      </Card>
    </div>
    <Tabs active={{ review: "To review", needs_verification: "Needs verification", saved: "Saved", rejected: "Rejected", all: "All" }[status] ?? "To review"} items={[
      { href: "/discoveries", label: "To review", count: n("new") + n("needs_verification") }, { href: "/discoveries?status=needs_verification", label: "Needs verification", count: n("needs_verification") },
      { href: "/discoveries?status=saved", label: "Saved", count: n("saved") }, { href: "/discoveries?status=rejected", label: "Rejected", count: n("rejected") }, { href: "/discoveries?status=all", label: "All" }]} />
    <Card tight>{rows.length ? <div className="list">{rows.map((d) => (
      <Link key={d.id} href={`/discoveries/${d.id}`} className="li">
        <div className="grow">
          <div className="ttl">{d.title} <Demo on={d.is_demo} /></div>
          <div className="meta">{C.label(C.DISCOVERY_KIND, d.kind)} · {d.source_name ?? "No source"} · {fmtDate(d.published_at) ?? "date unknown"}{d.location ? ` · ${d.location}` : ""}{d.sector ? ` · ${d.sector}` : ""}</div>
          {d.suggested ? <div className="small" style={{ marginTop: 3 }}>Suggested for: {d.suggested}</div> : null}
          {d.possible_dup && d.status !== "saved" ? <div className="small" style={{ marginTop: 3, color: "var(--amber)" }}>Possible duplicate of: {d.possible_dup}</div> : null}
        </div>
        <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}><StatusBadge value={d.status} opts={C.DISCOVERY_STATUS} /><InfoBadge value={d.info_status} />{d.ai_generated ? <Badge tone="sim">AI-generated</Badge> : null}</div>
      </Link>))}</div> : <Empty title="Nothing to review">Run a discovery search or add one manually.</Empty>}</Card>
  </>);
}
