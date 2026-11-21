import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Bars, Card, Empty, PageHead, Stat, fmtMoney } from "@/components/ui";

export const metadata = { title: "Reports & Analytics" };
const q = async <T,>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];

export default async function Reports() {
  const bySector = await q<{ label: string; n: number }>(sql`select coalesce(s.name,'Unassigned') as label, count(*)::int as n from projects p left join sectors s on s.id = p.sector_id group by 1 order by 2 desc`);
  const byLoc = await q<{ label: string; n: number }>(sql`select coalesce(nullif(city,''),'Unknown') as label, count(*)::int as n from projects group by 1 order by 2 desc`);
  const byStage = await q<{ label: string; n: number }>(sql`select development_stage as label, count(*)::int as n from projects group by 1 order by 2 desc`);
  const byStatus = await q<{ label: string; n: number }>(sql`select status as label, count(*)::int as n from projects group by 1 order by 2 desc`);
  const byVenture = await q<{ label: string; n: number; value: string | null; valued: number }>(sql`select v.name as label, count(o.id)::int as n, sum(o.estimated_value)::text as value, count(o.estimated_value)::int as valued
    from ventures v left join opportunities o on o.venture_id = v.id group by v.name, v.sort_order order by v.sort_order`);
  const trend = await q<{ label: string; n: number }>(sql`select to_char(date_trunc('week', created_at), 'DD Mon') as label, count(*)::int as n from discoveries where created_at > now() - interval '12 weeks' group by date_trunc('week', created_at) order by date_trunc('week', created_at)`);
  const research = await q<{ label: string; n: number }>(sql`select kind as label, count(*)::int as n from research_sessions group by 1 order by 2 desc`);
  const conv = (await db.execute(sql`select (select count(*) from discoveries)::int as disc, (select count(*) from discoveries where status = 'saved')::int as saved,
    (select count(*) from discoveries where status = 'rejected')::int as rejected, (select count(*) from projects)::int as projects,
    (select count(distinct project_id) from opportunities where project_id is not null)::int as with_opp,
    (select count(*) from opportunities where commercial_status = 'won')::int as won, (select count(*) from opportunities where commercial_status = 'lost')::int as lost`)).rows[0] as Record<string, number>;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const total = bySector.reduce((s, r) => s + r.n, 0);
  return (<>
    <PageHead title="Reports & Analytics" sub="Only metrics supported by actual records. Rates show “—” until there is enough data." />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <Stat k="Discovery → project" v={pct(conv.saved, conv.saved + conv.rejected)} d={`${conv.saved} saved / ${conv.rejected} rejected of ${conv.disc}`} />
      <Stat k="Projects with an opportunity" v={pct(conv.with_opp, conv.projects)} d={`${conv.with_opp} of ${conv.projects}`} />
      <Stat k="Win rate (closed)" v={pct(conv.won, conv.won + conv.lost)} d={`${conv.won} won / ${conv.lost} lost`} />
      <Stat k="Total projects" v={total} />
    </div>
    {total === 0 ? <Card><Empty title="No data to report yet">Reports populate as projects, discoveries and opportunities are recorded.</Empty></Card> : null}
    <div className="grid g2" style={{ marginTop: 14 }}>
      <Card title="Projects by sector"><Bars rows={bySector} /></Card>
      <Card title="Projects by location"><Bars rows={byLoc} /></Card>
      <Card title="Projects by development stage"><Bars rows={byStage.map((r) => ({ ...r, label: C.label(C.DEVELOPMENT_STAGE, r.label) }))} /></Card>
      <Card title="Projects by status"><Bars rows={byStatus.map((r) => ({ ...r, label: C.label(C.PROJECT_STATUS, r.label) }))} /></Card>
      <Card title="Opportunities by venture" sub="Estimated value sums only opportunities with a recorded value">
        <Bars rows={byVenture.filter((r) => r.n).map((r) => ({ label: r.label, n: r.n }))} empty="No opportunities yet" />
        {byVenture.some((r) => r.valued) ? <div className="stack small" style={{ marginTop: 12, gap: 4 }}>{byVenture.filter((r) => r.valued).map((r) => <div key={r.label} className="row" style={{ justifyContent: "space-between" }}><span className="muted">{r.label}</span><span>{fmtMoney(r.value)} <span className="faint">({r.valued} valued)</span></span></div>)}</div> : <p className="muted small" style={{ marginTop: 10 }}>No opportunity values recorded — commercial potential not shown.</p>}
      </Card>
      <Card title="Discovery trend" sub="Discoveries added per week, last 12 weeks"><Bars rows={trend} empty="No discoveries yet" /></Card>
      <Card title="Research activity"><Bars rows={research.map((r) => ({ ...r, label: C.label(C.RESEARCH_KIND, r.label) }))} empty="No research sessions yet" /></Card>
    </div>
  </>);
}
