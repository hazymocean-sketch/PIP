import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { TOOLS } from "@/server/agents/tools";
import { Badge, Card, Flash, PageHead, ago } from "@/components/ui";

export const metadata = { title: "Agents" };
export default async function Agents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const rows = (await db.execute(sql`select a.*, count(r.id)::int as runs, max(r.created_at) as last_run,
    (select string_agg(v.name, ', ') from agent_ventures av join ventures v on v.id = av.venture_id where av.agent_id = a.id) as ventures
    from agents a left join agent_runs r on r.agent_id = a.id group by a.id order by a.sort_order`)).rows as any[];
  return (<>
    <PageHead title="Agents" sub="Specialised agents with defined responsibilities, tools, rules and autonomy. Configure each one; every run is logged." actions={<Link className="btn" href="/command">Command Centre</Link>} />
    <Flash sp={sp} />
    <div className="notice" style={{ marginBottom: 14 }}>
      <strong>Modes:</strong> <em>Assist</em> — reads and recommends; every change needs approval. <em>Automate</em> — performs internal routine actions (tasks, routing, notes); anything external needs approval. <em>Autonomous</em> — may take external actions up to its explicit per-run limit.
    </div>
    <div className="grid g3">{rows.map((a) => (
      <Link key={a.id} href={`/agents/${a.id}`} className="card" style={{ display: "block" }}>
        <div className="card-h"><h2>{a.name}</h2><span className="row" style={{ gap: 4 }}>{!a.enabled ? <Badge tone="bad">Disabled</Badge> : null}<Badge tone={a.autonomy_mode === "autonomous" ? "warn" : a.autonomy_mode === "automate" ? "info" : "outline"}>{a.autonomy_mode}</Badge></span></div>
        <div className="card-b">
          <p className="small" style={{ color: "var(--text-2)" }}>{a.responsibility}</p>
          <div className="row" style={{ gap: 4, marginTop: 8 }}>{(a.tools as string[]).map((t) => <Badge key={t} tone={TOOLS[t]?.kind === "external" ? "sim" : "outline"}>{TOOLS[t]?.label ?? t}</Badge>)}</div>
          <div className="muted small" style={{ marginTop: 10 }}>{a.ventures ? `Ventures: ${a.ventures}` : "All ventures"} · {a.runs} runs{a.last_run ? ` · last ${ago(a.last_run)}` : ""}</div>
        </div>
      </Link>))}</div>
    <p className="muted small" style={{ marginTop: 10 }}>Purple tools need an external integration and run as SIMULATED until it is connected.</p>
  </>);
}
