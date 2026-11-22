import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { TOOLS } from "@/server/agents/tools";
import { Badge, Flash, Hint, PageHead, SectionTabs, ago } from "@/components/ui";

export const metadata = { title: "Automation" };
const MODE_HELP: Record<string, string> = {
  assist: "Assist: reads and recommends. Every change it proposes waits for your approval.",
  automate: "Automate: does routine internal work (tasks, routing, notes) on its own. Anything external still needs approval.",
  autonomous: "Autonomous: may also take external actions, up to its per-run limit. Beyond that it asks you.",
};
export default async function Agents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const rows = (await db.execute(sql`select a.*, count(r.id)::int as runs, max(r.created_at) as last_run,
    (select string_agg(v.name, ', ') from agent_ventures av join ventures v on v.id = av.venture_id where av.agent_id = a.id) as ventures
    from agents a left join agent_runs r on r.agent_id = a.id group by a.id order by a.sort_order`)).rows as any[];
  return (<>
    <PageHead title="Automation" sub="Specialised agents with their own responsibilities, tools, rules and autonomy, plus the workflows that run them. Every run is logged." actions={<Link className="btn" href="/command">Command</Link>} />
    <SectionTabs section="automation" active="Agents" />
    <Flash sp={sp} />
    <div className="grid g3">{rows.map((a) => (
      <Link key={a.id} href={`/agents/${a.id}`} className="card" style={{ display: "block" }}>
        <div className="card-h"><h2>{a.name}</h2><span className="row" style={{ gap: 4 }}>{!a.enabled ? <Badge tone="bad">Disabled</Badge> : null}<Badge tone={a.autonomy_mode === "autonomous" ? "warn" : a.autonomy_mode === "automate" ? "info" : "outline"}>{a.autonomy_mode}</Badge><Hint text={MODE_HELP[a.autonomy_mode as string] ?? ""} /></span></div>
        <div className="card-b">
          <p className="small" style={{ color: "var(--text-2)" }}>{a.responsibility}</p>
          <div className="row" style={{ gap: 4, marginTop: 8 }}>{(a.tools as string[]).map((t) => <Badge key={t} tone={TOOLS[t]?.kind === "external" ? "sim" : "outline"}>{TOOLS[t]?.label ?? t}</Badge>)}</div>
          <div className="muted small" style={{ marginTop: 10 }}>{a.ventures ? `Ventures: ${a.ventures}` : "All ventures"} · {a.runs} runs{a.last_run ? ` · last ${ago(a.last_run)}` : ""}</div>
        </div>
      </Link>))}</div>
    <p className="muted small row" style={{ marginTop: 12, gap: 6 }}><span className="badge sim">external</span> tools need an integration and run as simulated until it is connected.</p>
  </>);
}
