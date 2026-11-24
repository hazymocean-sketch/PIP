import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Card, Demo, Empty, Flash, PageHead, Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LiveButton, ResearchAgain } from "@/components/live-button";
import { QuerySelect } from "@/components/discovery-client";

export const metadata = { title: "Projects" };

type Co = { n: string; r: string };

export default async function Projects({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const live = sp.live === "1" ? "1" : sp.live === "0" ? "0" : "";
  const keep: Record<string, string> = {};
  for (const k of ["q", "live", "venture", "sector"]) if (sp[k]) keep[k] = sp[k];
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    return `/projects${p.toString() ? `?${p}` : ""}`;
  };

  const conds = [sql`true`];
  if (q) conds.push(sql`(p.name ilike ${"%" + q + "%"} or p.brand ilike ${"%" + q + "%"} or p.city ilike ${"%" + q + "%"})`);
  if (sp.sector) conds.push(sql`(p.sector_id = ${sp.sector} or p.sub_sector_id = ${sp.sector})`);
  if (sp.venture) conds.push(sql`exists (select 1 from project_ventures pv where pv.project_id = p.id and pv.venture_id = ${sp.venture})`);
  const base = sql.join(conds, sql` and `);
  const liveCond = live === "1" ? sql`p.is_live` : live === "0" ? sql`not p.is_live` : sql`true`;

  const [rowsR, sectorsR, venturesR, countsR] = await Promise.all([
    db.execute(sql`select p.id, p.name, p.city, p.is_demo, p.is_live, p.development_stage, p.procurement_stage, p.expected_completion,
        p.live_research_status, p.live_research_note, p.live_research_at, s.name as sector, ss.name as sub_sector,
        (select coalesce(json_agg(v.name order by v.sort_order), '[]') from project_ventures pv join ventures v on v.id = pv.venture_id where pv.project_id = p.id) as ventures,
        (select coalesce(json_agg(json_build_object('n', c.name, 'r', pc.role) order by pc.created_at), '[]') from project_companies pc join companies c on c.id = pc.company_id where pc.project_id = p.id) as companies,
        (select min(d.created_at) from discoveries d where d.project_id = p.id) as discovered_at
      from projects p left join sectors s on s.id = p.sector_id left join sectors ss on ss.id = p.sub_sector_id
      where ${base} and ${liveCond} order by p.is_live desc, p.updated_at desc limit 300`),
    db.execute(sql`select id, name from sectors where parent_id is null order by sort_order`),
    db.execute(sql`select id, name from ventures where active order by sort_order`),
    db.execute(sql`select count(*)::int as all, count(*) filter (where p.is_live)::int as live from projects p where ${base}`),
  ]);
  const rows = rowsR.rows as any[];
  const sectors = sectorsR.rows as { id: string; name: string }[];
  const ventures = venturesR.rows as { id: string; name: string }[];
  const counts = countsR.rows[0] as { all: number; live: number };
  const roleLabel = (r: string) => C.label(C.COMPANY_CATEGORY, r, r).toLowerCase();
  const stage = (p: any) => [p.development_stage !== "unknown" ? C.label(C.DEVELOPMENT_STAGE, p.development_stage) : null, p.procurement_stage !== "unknown" ? C.label(C.PROCUREMENT_STAGE, p.procurement_stage) : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHead title="Projects" sub="Your pipeline. Press Go live on a project you're working: it opens a deal per venture in the CRM and researches the project. Missing facts show as “Not found yet” — never invented."
        actions={<Link className="btn primary" href="/projects/new"><Icon name="plus" />New project</Link>} />
      <Flash sp={sp} />
      <div className="pl-filters">
        <nav className="seg" aria-label="Live filter">
          <a className={live === "" ? "on" : ""} href={href({ live: null })}>All<span className="n">{counts.all}</span></a>
          <a className={live === "1" ? "on" : ""} href={href({ live: "1" })}>Live<span className="n">{counts.live}</span></a>
          <a className={live === "0" ? "on" : ""} href={href({ live: "0" })}>Not live<span className="n">{counts.all - counts.live}</span></a>
        </nav>
        <nav className="seg" aria-label="Venture filter">
          <a className={!sp.venture ? "on" : ""} href={href({ venture: null })}>All ventures</a>
          {ventures.map((v) => <a key={v.id} className={sp.venture === v.id ? "on" : ""} href={href({ venture: v.id })} title={v.name}>{v.name.replace(/\s*\(.*\)\s*$/, "")}</a>)}
        </nav>
        <QuerySelect name="sector" label="Sector" value={sp.sector ?? ""} base="/projects" params={keep} options={[{ value: "", label: "Sector: All" }, ...sectors.map((s) => ({ value: s.id, label: s.name }))]} />
        <form className="search">{Object.entries(keep).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="search" name="q" placeholder="Search projects" defaultValue={q} /></form>
      </div>

      <Card tight className="pl-list">
        {rows.length ? rows.map((p) => {
          const cos = (p.companies ?? []) as Co[];
          const dev = cos.filter((c) => c.r === "developer" || c.r === "owner").map((c) => c.n);
          const mc = cos.filter((c) => c.r === "main_contractor").map((c) => c.n);
          const others = cos.filter((c) => !["developer", "owner", "main_contractor"].includes(c.r));
          const researching = p.live_research_status === "running" && p.live_research_at && Date.now() - new Date(p.live_research_at).getTime() < 3 * 60_000;
          const st = stage(p);
          return (
            <div key={p.id} className="pl-row">
              <div><LiveButton projectId={p.id} live={p.is_live} researching={!!researching} name={p.name} /></div>
              <div>
                <Link className="pl-title" href={`/projects/${p.id}`}>{p.name}</Link> <Demo on={p.is_demo} />
                <div className="pl-meta">
                  <span>{p.city ?? "Location unknown"}</span>·<span>{p.sub_sector ?? p.sector ?? "Sector unknown"}</span>
                  <span className="pl-from">{p.discovered_at ? `Discover · ${fmtDate(p.discovered_at)}` : "Added manually"}</span>
                </div>
                <dl className="pl-facts">
                  {researching ? ["Client / developer", "Main contractor", "Consultants & others", "Project stage", "Expected completion"].map((k) => <div key={k}><dt>{k}</dt><dd><div className="shimmer" /></dd></div>) : <>
                    <div><dt>Client / developer</dt><dd className={dev.length ? "" : "unk"}>{dev.join(", ") || "Not found yet"}</dd></div>
                    <div><dt>Main contractor</dt><dd className={mc.length ? "" : "unk"}>{mc.join(", ") || "Not found yet"}</dd></div>
                    <div><dt>Consultants &amp; others</dt><dd className={others.length ? "" : "unk"}>{others.length ? others.map((c, i) => <span key={i}>{i ? " · " : ""}{c.n} <span className="role">({roleLabel(c.r)})</span></span>) : "Not found yet"}</dd></div>
                    <div><dt>Project stage</dt><dd className={st ? "" : "unk"}>{st || "Not found yet"}</dd></div>
                    <div><dt>Expected completion</dt><dd className={p.expected_completion ? "" : "unk"}>{p.expected_completion || "Not found yet"}</dd></div>
                  </>}
                </dl>
                {!researching && p.is_live ? <div className="pl-note"><span>{p.live_research_status === "running" ? "Research was interrupted." : p.live_research_note ?? "Not researched yet."}</span><ResearchAgain projectId={p.id} /></div> : null}
              </div>
              <div className="pl-right"><div className="pl-ven">{(p.ventures as string[]).length ? (p.ventures as string[]).map((v) => <Badge key={v} tone="outline">{v}</Badge>) : <span className="faint small">No venture yet</span>}</div></div>
            </div>
          );
        }) : <Empty title={Object.keys(keep).length ? "No projects match these filters" : "No projects yet"} action={<Link className="btn primary" href="/discoveries">Discover projects</Link>}>
          Save discoveries as projects, or add one manually.
        </Empty>}
      </Card>
      <p className="muted small" style={{ marginTop: 8 }}>{rows.length} project(s)</p>
    </>
  );
}
