import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { QuerySelect } from "@/components/discovery-client";
import { closeDealAction, openDealsAction, reopenDealAction } from "@/server/actions";
import { LOST_REASONS } from "@/server/live";

export const metadata = { title: "CRM" };

const money = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = Number(n);
  return v >= 1e6 ? `AED ${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `AED ${Math.round(v / 1e3)}K` : `AED ${Math.round(v)}`;
};

export default async function CRM({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = ["won", "lost", "all"].includes(sp.status) ? sp.status : "live";
  const keep: Record<string, string> = {};
  for (const k of ["status", "venture", "sector", "q"]) if (sp[k]) keep[k] = sp[k];
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    return `/opportunities${p.toString() ? `?${p}` : ""}`;
  };
  const listUrl = href({});

  // Venture + sector filters apply to the KPIs too; the status tab only to the list.
  const f = [sql`true`];
  if (sp.venture) f.push(sql`o.venture_id = ${sp.venture}`);
  if (sp.sector) f.push(sql`(p.sector_id = ${sp.sector} or p.sub_sector_id = ${sp.sector})`);
  if (sp.q) f.push(sql`(o.title ilike ${"%" + sp.q + "%"} or p.name ilike ${"%" + sp.q + "%"})`);
  const base = sql.join(f, sql` and `);
  const tabCond = tab === "live" ? sql`o.commercial_status not in ('won','lost')` : tab === "all" ? sql`true` : sql`o.commercial_status = ${tab}`;
  const from = sql`from opportunities o left join projects p on p.id = o.project_id`;

  const [rowsR, kR, reasonR, targetsR, venturesR, sectorsR] = await Promise.all([
    db.execute(sql`select o.*, v.name as venture, v.sort_order as venture_order, p.name as project, p.city, p.is_live as project_live, coalesce(ss.name, s.name) as sector, st.name as stage,
        (select coalesce(json_agg(json_build_object('id', pv2.venture_id, 'name', v2.name) order by v2.sort_order), '[]') from project_ventures pv2 join ventures v2 on v2.id = pv2.venture_id where pv2.project_id = o.project_id) as project_ventures
      ${from} left join ventures v on v.id = o.venture_id left join sectors s on s.id = p.sector_id left join sectors ss on ss.id = p.sub_sector_id
      left join pipeline_stages st on st.id = o.stage_id
      where ${base} and ${tabCond}
      order by case when o.commercial_status in ('won','lost') then 1 else 0 end, o.follow_up_date asc nulls last, o.closed_at desc nulls last, o.updated_at desc limit 300`),
    db.execute(sql`select
        count(*) filter (where o.commercial_status not in ('won','lost'))::int as live,
        count(distinct o.project_id) filter (where o.commercial_status not in ('won','lost'))::int as live_projects,
        coalesce(sum(o.estimated_value) filter (where o.commercial_status not in ('won','lost')), 0)::float as pipeline,
        count(*) filter (where o.commercial_status not in ('won','lost') and o.estimated_value is null)::int as no_value,
        coalesce(sum(o.estimated_value) filter (where o.commercial_status = 'won' and o.closed_at >= date_trunc('quarter', now())), 0)::float as won_q,
        count(*) filter (where o.commercial_status = 'won' and o.closed_at >= date_trunc('quarter', now()))::int as won_q_n,
        count(*) filter (where o.commercial_status = 'won' and o.closed_at >= now() - interval '90 days')::int as won_90,
        count(*) filter (where o.commercial_status in ('won','lost') and o.closed_at >= now() - interval '90 days')::int as closed_90,
        count(*) filter (where o.commercial_status = 'lost' and o.closed_at >= now() - interval '90 days')::int as lost_90
      ${from} where ${base}`),
    db.execute(sql`select split_part(o.lost_reason, ' — ', 1) as reason, count(*)::int as n ${from}
      where ${base} and o.commercial_status = 'lost' and o.closed_at >= now() - interval '90 days' and o.lost_reason is not null group by 1 order by 2 desc limit 1`),
    db.execute(sql`select v.id, v.name, v.monthly_target::float as target,
        coalesce((select sum(o.estimated_value) ${from} where o.venture_id = v.id and o.commercial_status = 'won' and o.closed_at >= date_trunc('month', now())
          ${sp.sector ? sql`and (p.sector_id = ${sp.sector} or p.sub_sector_id = ${sp.sector})` : sql``}), 0)::float as won
      from ventures v where v.active ${sp.venture ? sql`and v.id = ${sp.venture}` : sql``} order by v.sort_order`),
    db.execute(sql`select id, name from ventures where active order by sort_order`),
    db.execute(sql`select id, name from sectors where parent_id is null order by sort_order`),
  ]);
  const rows = rowsR.rows as any[];
  const k = kR.rows[0] as Record<string, number>;
  const topReason = reasonR.rows[0] as { reason: string; n: number } | undefined;
  const targets = targetsR.rows as { id: string; name: string; target: number | null; won: number }[];
  const anyTarget = targets.some((t) => t.target);
  const ventures = venturesR.rows as { id: string; name: string }[];
  const sectors = sectorsR.rows as { id: string; name: string }[];
  const month = new Date().toLocaleString("en-GB", { month: "long", timeZone: "Asia/Dubai" });
  const today = new Date().toISOString().slice(0, 10);

  const kpis = [
    ["Live deals", String(k.live), `across ${k.live_projects} project${k.live_projects === 1 ? "" : "s"}`],
    ["Pipeline value", money(k.pipeline), k.no_value ? `${k.no_value} live deal${k.no_value === 1 ? "" : "s"} without a value` : "live deals only"],
    ["Won · this quarter", money(k.won_q), `${k.won_q_n} deal${k.won_q_n === 1 ? "" : "s"}`],
    ["Win rate", k.closed_90 ? `${Math.round((k.won_90 / k.closed_90) * 100)}%` : "—", k.closed_90 ? `${k.won_90} won of ${k.closed_90} closed · 90 days` : "no closed deals in 90 days"],
    ["Top lost reason", topReason?.reason ?? "—", topReason ? `${topReason.n} of ${k.lost_90} losses · 90 days` : "no losses in 90 days"],
  ];

  // One row per project: its deals (one per venture) listed together
  const short = (n: string) => n.replace(/\s*\(.*\)\s*$/, "");
  const groupMap = new Map<string, { key: string; deals: any[]; allDeals: any[] }>();
  for (const o of rows) { const key = o.project_id ?? `deal-${o.id}`; const g = groupMap.get(key) ?? { key, deals: [] as any[], allDeals: [] as any[] }; g.deals.push(o); groupMap.set(key, g); }
  for (const g of groupMap.values()) g.deals.sort((a, b) => (a.venture_order ?? 99) - (b.venture_order ?? 99));
  const projIds = [...groupMap.values()].map((g) => g.deals[0].project_id).filter(Boolean) as string[];
  const allDealsR: { rows: unknown[] } = projIds.length ? await db.execute(sql`select id, project_id, venture_id from opportunities where project_id in (${sql.join(projIds.map((i) => sql`${i}::uuid`), sql`, `)})`) : { rows: [] };
  for (const g of groupMap.values()) g.allDeals = (allDealsR.rows as any[]).filter((d) => d.project_id === g.deals[0].project_id);
  const groups = [...groupMap.values()];

  const status = (o: any) => o.commercial_status === "won" ? "won" : o.commercial_status === "lost" ? "lost" : o.commercial_status === "on_hold" ? "hold" : "live";

  return (<>
    <PageHead title="CRM" sub="Your live projects and their deals. A project enters the CRM only when you press Go live on it in Projects. Filter by venture or sector — the numbers follow your filters."
      actions={<Link className="btn" href="/projects?live=0">Projects not live yet</Link>} />
    <Flash sp={sp} />

    <div className="crm-kpis">{kpis.map(([l, v, s]) => <div key={l} className="card crm-kpi"><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>)}</div>

    <div className="card crm-targets">
      <div className="crm-kpi" style={{ padding: 0 }}><div className="l">Monthly target progress · {month}</div></div>
      {anyTarget ? <div className="crm-tg">{targets.filter((t) => t.target).map((t) => {
        const pct = Math.round((t.won / t.target!) * 100);
        return <div key={t.id}><div className="n"><span>{t.name}</span><span>{pct}%</span></div><div className="crm-bar"><b style={{ width: `${Math.min(pct, 100)}%` }} /></div><div className="t">{money(t.won)} of {money(t.target)}</div></div>;
      })}</div> : <p className="muted small" style={{ margin: "12px 0 0" }}>No targets yet. Set a monthly target for each venture in <Link className="link" href="/settings/ventures">Settings → Ventures</Link>.</p>}
    </div>

    <div className="pl-filters">
      <nav className="seg" aria-label="Status">
        {[["live", "Live"], ["won", "Won"], ["lost", "Lost"], ["all", "All"]].map(([v, l]) => <a key={v} className={tab === v ? "on" : ""} href={href({ status: v === "live" ? null : v })}>{l}</a>)}
      </nav>
      <nav className="seg" aria-label="Venture">
        <a className={!sp.venture ? "on" : ""} href={href({ venture: null })}>All ventures</a>
        {ventures.map((v) => <a key={v.id} className={sp.venture === v.id ? "on" : ""} href={href({ venture: v.id })} title={v.name}>{v.name.replace(/\s*\(.*\)\s*$/, "")}</a>)}
      </nav>
      <QuerySelect name="sector" label="Sector" value={sp.sector ?? ""} base="/opportunities" params={keep} options={[{ value: "", label: "Sector: All" }, ...sectors.map((s) => ({ value: s.id, label: s.name }))]} />
    </div>

    <Card tight className="pl-list">
      {groups.length ? <>
        <div className="crm-proj h"><span>Project</span><div className="crm-deal"><span>Venture</span><span>Stage</span><span>Value</span><span>Next action</span><span>Status</span></div></div>
        {groups.map((g) => {
          const o0 = g.deals[0];
          const dealVentures = new Set(g.allDeals.map((d: any) => d.venture_id));
          const missing = (o0.project_ventures as { id: string; name: string }[]).filter((v) => !dealVentures.has(v.id));
          return (
            <div key={g.key} className="crm-proj">
              <div className="crm-p">
                <Link className="p" href={o0.project_id ? `/pipeline?project=${o0.project_id}` : `/opportunities/${o0.id}`} title="Open the pipeline">{o0.project ?? o0.title}</Link> <Demo on={o0.is_demo} />
                <div className="sub">{[o0.city, o0.sector].filter(Boolean).join(" · ") || "—"}</div>
                <div className="crm-vens">{(o0.project_ventures as { id: string; name: string }[]).map((v) => <Badge key={v.id} tone="outline">{short(v.name)}</Badge>)}</div>
              </div>
              <div className="crm-deals">
                {g.deals.map((o: any) => {
                  const s = status(o);
                  const overdue = o.follow_up_date && o.follow_up_date < today && s === "live";
                  return (
                    <div key={o.id} className="crm-deal">
                      <div>{o.venture ? <Link href={`/opportunities/${o.id}`} className="ven-link" title="Deal details">{short(o.venture)}</Link> : <Link href={`/opportunities/${o.id}`} className="ven-link faint">No venture</Link>}</div>
                      <span className="soft">{o.stage ?? C.label(C.COMMERCIAL_STATUS, o.commercial_status)}</span>
                      <span className="num">{o.estimated_value ? money(Number(o.estimated_value)) : <span className="faint">—</span>}</span>
                      <div>{o.next_action ? <div>{o.next_action}</div> : <span className="faint small">None set</span>}{o.follow_up_date ? <div className="sub" style={overdue ? { color: "var(--bad)" } : undefined}>{overdue ? "Overdue · " : ""}{fmtDate(o.follow_up_date)}</div> : null}</div>
                      <div>
                        <span className={`st ${s}`}><i />{s === "hold" ? "On hold" : s}</span>
                        {s === "lost" && o.lost_reason ? <div className="crm-why">{o.lost_reason}</div> : null}
                        {s === "won" && o.closed_at ? <div className="crm-why">{fmtDate(o.closed_at)}</div> : null}
                        <div className="crm-act">
                          {s === "live" || s === "hold" ? <>
                            <form action={closeDealAction.bind(null, o.id, "won")}><input type="hidden" name="_back" value={listUrl} /><button className="btn xs" type="submit">Won</button></form>
                            <details><summary className="btn xs" style={{ listStyle: "none" }}>Lost</summary>
                              <div><form action={closeDealAction.bind(null, o.id, "lost")} className="stack" style={{ gap: 8 }}>
                                <input type="hidden" name="_back" value={listUrl} />
                                <select name="reason" required defaultValue=""><option value="" disabled>Why was it lost?</option>{LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                                <input name="reasonNote" placeholder="Detail (optional), e.g. 12% above winner" />
                                <button className="btn danger sm" type="submit">Mark as lost</button>
                              </form></div>
                            </details>
                          </> : <form action={reopenDealAction.bind(null, o.id)}><input type="hidden" name="_back" value={listUrl} /><button className="btn xs ghost" type="submit">Re-open</button></form>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tab !== "won" && tab !== "lost" && o0.project_id && missing.length ? (
                  <div className="crm-deal missing">
                    <div>{missing.map((v) => <span key={v.id} className="ven-link faint">{short(v.name)}</span>)}</div>
                    <span className="faint small" style={{ gridColumn: "span 3" }}>Linked to this project, no deal yet</span>
                    <form action={openDealsAction.bind(null, o0.project_id)}><input type="hidden" name="_back" value={listUrl} /><button className="btn xs" type="submit">Open deal{missing.length > 1 ? "s" : ""}</button></form>
                  </div>) : null}
              </div>
            </div>
          );
        })}
      </> : <Empty title={tab === "live" ? "No live deals" : "No deals here"} action={<Link className="btn primary" href="/projects">Go to Projects</Link>}>Press <b>Go live</b> on a project to open its deals here.</Empty>}
    </Card>
  </>);
}
