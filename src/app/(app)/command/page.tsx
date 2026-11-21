import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { decideApprovalAction, markAllRead, sendCommand } from "@/server/actions";
import { integrationStatus } from "@/server/ai/providers";
import { TOOLS } from "@/server/agents/tools";
import { Submit } from "@/components/client";
import { AgentButton } from "@/components/panels";
import { Badge, Card, Demo, Empty, Flash, PageHead, Sim, StatusBadge, Tabs, ago } from "@/components/ui";

export const metadata = { title: "AI Command Centre" };

async function insights() {
  const r = (await db.execute(sql`select
    (select count(*) from discoveries where status = 'new')::int as unreviewed,
    (select count(*) from projects p where not exists (select 1 from sources s where s.project_id = p.id) and p.status not in ('cancelled','lost'))::int as no_sources,
    (select count(*) from opportunities where next_action is null and commercial_status in ('open','proposal','negotiation'))::int as no_next,
    (select count(*) from tasks where due_date < current_date and status in ('open','in_progress'))::int as overdue,
    (select count(*) from projects where updated_at < now() - interval '30 days' and status not in ('won','lost','cancelled'))::int as stale,
    (select count(*) from ventures where not services_confirmed and active)::int as tbc_ventures,
    (select count(*) from (select pv.project_id from project_ventures pv where not exists (select 1 from opportunities o where o.project_id = pv.project_id and o.venture_id = pv.venture_id)) x)::int as unworked_links,
    (select count(*) from projects where opportunity_score is null and status in ('verified','qualified'))::int as unscored`)).rows[0] as Record<string, number>;
  const out: { level: "warn" | "info" | "bad"; text: string; href: string; agent?: string }[] = [];
  if (r.overdue) out.push({ level: "bad", text: `${r.overdue} overdue task(s)`, href: "/tasks?view=overdue", agent: "operations" });
  if (r.unreviewed) out.push({ level: "warn", text: `${r.unreviewed} discoveries awaiting review`, href: "/discoveries", agent: "business_development" });
  if (r.no_next) out.push({ level: "warn", text: `${r.no_next} open opportunities have no next action`, href: "/opportunities", agent: "sales" });
  if (r.unworked_links) out.push({ level: "info", text: `${r.unworked_links} project–venture links have no opportunity yet`, href: "/projects", agent: "lead_generation" });
  if (r.no_sources) out.push({ level: "warn", text: `${r.no_sources} project(s) have no supporting source`, href: "/projects" });
  if (r.unscored) out.push({ level: "info", text: `${r.unscored} verified/qualified project(s) are not scored`, href: "/projects?status=verified" });
  if (r.stale) out.push({ level: "info", text: `${r.stale} project(s) not updated in 30 days`, href: "/projects", agent: "research" });
  if (r.tbc_ventures) out.push({ level: "info", text: `${r.tbc_ventures} venture(s) have unconfirmed services — agents won't route to them`, href: "/settings/ventures" });
  return out;
}

export default async function Command({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "console";
  const agents = await db.select().from(S.agents).orderBy(S.agents.sortOrder);
  const ventures = await db.select().from(S.ventures).where(eq(S.ventures.active, true)).orderBy(S.ventures.sortOrder);
  const pendingCount = (await db.execute(sql`select count(*)::int as n from approvals where status = 'pending'`)).rows[0] as { n: number };
  const unread = (await db.execute(sql`select count(*)::int as n from notifications where read_at is null`)).rows[0] as { n: number };
  const integ = integrationStatus();
  const ai = integ.find((i) => i.key === "ai")!;
  const tabs = [
    { href: "/command", label: "Console" }, { href: "/command?tab=approvals", label: "Approvals", count: pendingCount.n },
    { href: "/command?tab=activity", label: "Activity" }, { href: "/command?tab=insights", label: "Insights" },
    { href: "/command?tab=performance", label: "Agent performance" }, { href: "/command?tab=notifications", label: "Notifications", count: unread.n },
  ];
  const activeLabel = tabs.find((t) => t.href.endsWith(`tab=${tab}`))?.label ?? "Console";

  return (<>
    <PageHead title="AI Command Centre" sub="Assign work to agents, approve proposed actions and monitor automation across every venture."
      actions={<Badge tone={ai.connected ? "good" : "sim"}>{ai.connected ? "AI model connected (untested)" : "Rule-based planner · no AI model connected"}</Badge>} />
    <Flash sp={sp} />
    <Tabs items={tabs} active={activeLabel} />

    {tab === "console" ? <Console agents={agents} ventures={ventures} /> : null}
    {tab === "approvals" ? <Approvals /> : null}
    {tab === "activity" ? <Activity /> : null}
    {tab === "insights" ? <Insights /> : null}
    {tab === "performance" ? <Performance /> : null}
    {tab === "notifications" ? <Notifications /> : null}
  </>);
}

async function Console({ agents, ventures }: { agents: (typeof S.agents.$inferSelect)[]; ventures: (typeof S.ventures.$inferSelect)[] }) {
  const msgs = (await db.select().from(S.commandMessages).orderBy(desc(S.commandMessages.createdAt)).limit(40)).reverse();
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "PIP";
  const list = await insights();
  return (
    <div className="split">
      <div className="stack">
        <Card title="Talk to PIP" sub="Describe what you need. PIP routes it to the right agent — or pick one." tight>
          <div className="chat">
            {msgs.length ? msgs.map((m) => (
              <div key={m.id} className={`msg ${m.role === "user" ? "user" : "agent"}`}>
                {m.role !== "user" ? <div className="who">{agentName(m.agentId)}{m.isDemo ? " · DEMO" : ""}</div> : null}
                {m.content}
                {m.agentRunId ? <div style={{ marginTop: 6 }}><Link className="link small" href={`/agents/runs/${m.agentRunId}`}>View run →</Link></div> : null}
              </div>)) : <Empty title="No conversation yet">Try: “Research Coral Bay resort”, “Give me today's brief”, “Review the Calibro pipeline”, “Find new hotel projects in Ras Al Khaimah for Calibro”.</Empty>}
          </div>
          <form action={sendCommand} className="composer">
            <textarea name="message" placeholder="Ask PIP… e.g. Find new resort projects in Ras Al Khaimah for MOOG" required />
            <select name="agentId" defaultValue=""><option value="">Auto-route</option>{agents.filter((a) => a.enabled).map((a) => <option key={a.id} value={a.id}>{a.name.replace(" Agent", "")}</option>)}</select>
            <select name="ventureId" defaultValue=""><option value="">Any venture</option>{ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <Submit pendingText="Agent working…">Send</Submit>
          </form>
        </Card>
        <Card title="Quick runs" sub="Run an agent now on real PIP data">
          <div className="row">
            <AgentButton agentKey="executive_assistant" label="Daily brief" instruction="Daily brief" back="/command" />
            <AgentButton agentKey="sales" label="Pipeline review" instruction="Pipeline review" back="/command" />
            <AgentButton agentKey="operations" label="Health scan" instruction="Operations scan" back="/command" />
            <AgentButton agentKey="business_development" label="Route discoveries" instruction="Route new discoveries" back="/command" />
            <AgentButton agentKey="analytics" label="Analytics snapshot" instruction="Snapshot" back="/command" />
          </div>
        </Card>
      </div>
      <div className="stack">
        <Card title="Insights" sub="Computed from your records" tight>
          {list.length ? <div className="list">{list.map((i) => <Link key={i.text} href={i.href} className="li"><span className={`badge ${i.level === "bad" ? "bad" : i.level === "warn" ? "warn" : "info"}`}><span className="dot" /></span><div className="grow small">{i.text}</div></Link>)}</div> : <Empty title="All clear">No issues detected in current data.</Empty>}
        </Card>
        <Card title="Agents">
          <div className="stack" style={{ gap: 6 }}>{agents.map((a) => <Link key={a.id} href={`/agents/${a.id}`} className="row" style={{ justifyContent: "space-between" }}><span className="small">{a.name}</span><span className="row" style={{ gap: 4 }}>{!a.enabled ? <Badge tone="bad">off</Badge> : null}<Badge tone="outline">{a.autonomyMode}</Badge></span></Link>)}</div>
        </Card>
      </div>
    </div>
  );
}

async function Approvals() {
  const rows = (await db.execute(sql`select ap.*, a.name as agent, v.name as venture, w.name as workflow from approvals ap left join agents a on a.id = ap.agent_id left join ventures v on v.id = ap.venture_id
    left join workflow_runs wr on wr.id = ap.workflow_run_id left join workflows w on w.id = wr.workflow_id order by (ap.status = 'pending') desc, ap.created_at desc limit 100`)).rows as any[];
  return (
    <Card tight title="Approval queue" sub="External communications and consequential actions wait here unless explicitly authorised">
      {rows.length ? <div className="list">{rows.map((a) => {
        const p = (a.payload ?? {}) as Record<string, any>;
        const tool = a.tool ? TOOLS[a.tool] : null;
        return (
          <div key={a.id} className="li" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><div className="ttl">{a.title} <Demo on={a.is_demo} /></div>
                <div className="meta">{a.agent ?? (a.workflow ? `Workflow: ${a.workflow}` : "System")}{a.venture ? ` · ${a.venture}` : ""} · {ago(a.created_at)}{tool ? ` · tool: ${tool.label} (${tool.kind})` : ""}</div></div>
              <div className="row" style={{ gap: 6 }}><Badge tone={a.risk_level === "high" ? "bad" : a.risk_level === "medium" ? "warn" : "outline"}>{a.risk_level} risk</Badge><Sim on={a.is_simulated} /><StatusBadge value={a.status} opts={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} /></div>
            </div>
            {a.tool === "send_email" ? <div className="card" style={{ marginTop: 8 }}><div className="card-b small"><div className="muted">To: {p.to ?? "(none)"} · Subject: {p.subject}</div><div className="pre" style={{ marginTop: 6 }}>{p.body}</div></div></div>
              : Object.keys(p).length ? <details style={{ marginTop: 6 }}><summary>Payload</summary><pre className="json">{JSON.stringify(p, null, 2)}</pre></details> : null}
            {a.is_simulated && a.status === "pending" ? <div className="notice sim" style={{ marginTop: 8 }}>The integration for this action is not connected. Approving records your decision; the action itself will be SIMULATED and nothing will leave PIP.</div> : null}
            {a.status === "pending" ? (
              <div className="row" style={{ marginTop: 8 }}>
                <form action={decideApprovalAction.bind(null, a.id, "approved")} className="row"><input name="note" placeholder="Note (optional)" style={{ width: 220 }} /><Submit className="btn good">Approve</Submit></form>
                <form action={decideApprovalAction.bind(null, a.id, "rejected")}><Submit className="btn danger">Reject</Submit></form>
              </div>) : <div className="small muted" style={{ marginTop: 6 }}>{a.status === "approved" ? "Result: " + ((a.execution_result as any)?.message ?? "continued") : `Rejected${a.decision_note ? `: ${a.decision_note}` : ""}`}</div>}
          </div>);
      })}</div> : <Empty title="No approvals">When an agent or workflow needs your sign-off, it appears here.</Empty>}
    </Card>
  );
}

async function Activity() {
  const runs = (await db.execute(sql`select r.*, a.name as agent from agent_runs r join agents a on a.id = r.agent_id order by r.created_at desc limit 40`)).rows as any[];
  const wruns = (await db.execute(sql`select r.*, w.name as workflow from workflow_runs r join workflows w on w.id = r.workflow_id order by r.created_at desc limit 25`)).rows as any[];
  return (
    <div className="grid g2">
      <Card title="Agent runs" tight actions={<Link className="btn ghost sm" href="/agents">Agents</Link>}>
        {runs.length ? <div className="list">{runs.map((r) => <Link key={r.id} href={`/agents/runs/${r.id}`} className="li"><div className="grow"><div className="ttl small">{r.agent} <Demo on={r.is_demo} /></div><div className="meta">{r.summary ?? r.instruction}</div><div className="meta">{r.triggered_by} · {r.mode} · {ago(r.created_at)}</div></div><div className="stack" style={{ gap: 4, alignItems: "flex-end" }}><StatusBadge value={r.status} opts={C.RUN_STATUS} /><Sim on={r.is_simulated} /></div></Link>)}</div> : <Empty title="No agent runs yet" />}
      </Card>
      <Card title="Workflow runs" tight actions={<Link className="btn ghost sm" href="/automations">Workflows</Link>}>
        {wruns.length ? <div className="list">{wruns.map((r) => <Link key={r.id} href={`/automations/runs/${r.id}`} className="li"><div className="grow"><div className="ttl small">{r.workflow} <Demo on={r.is_demo} /></div><div className="meta">{(r.trigger as any)?.source ?? "manual"} · attempt {r.attempt} · {ago(r.created_at)}</div>{r.error ? <div className="meta" style={{ color: "var(--red)" }}>{r.error}</div> : null}</div><StatusBadge value={r.status} opts={C.RUN_STATUS.concat([{ value: "skipped", label: "Skipped" }])} /></Link>)}</div> : <Empty title="No workflow runs yet" />}
      </Card>
    </div>
  );
}

async function Insights() {
  const list = await insights();
  return <Card tight title="Business-wide insights" sub="Rule-based, from live records. An AI model can add narrative analysis once connected.">
    {list.length ? <div className="list">{list.map((i) => <div key={i.text} className="li"><span className={`badge ${i.level === "bad" ? "bad" : i.level === "warn" ? "warn" : "info"}`}>{i.level === "bad" ? "Action" : i.level === "warn" ? "Attention" : "Info"}</span>
      <div className="grow"><Link className="ttl link" href={i.href}>{i.text}</Link></div>{i.agent ? <AgentButton agentKey={i.agent} label="Ask agent" instruction={i.text} back="/command?tab=insights" /> : null}</div>)}</div> : <Empty title="No issues detected" />}
  </Card>;
}

async function Performance() {
  const rows = (await db.execute(sql`select a.id, a.name, a.autonomy_mode, a.enabled,
    count(r.id)::int as runs, count(r.id) filter (where r.status = 'completed')::int as completed, count(r.id) filter (where r.status = 'failed')::int as failed,
    count(r.id) filter (where r.is_simulated)::int as simulated,
    (select count(*) from approvals ap where ap.agent_id = a.id and ap.status = 'approved')::int as approved,
    (select count(*) from approvals ap where ap.agent_id = a.id and ap.status = 'rejected')::int as rejected,
    (select count(*) from tasks t where t.created_by_agent_id = a.id)::int as tasks_created,
    max(r.created_at) as last_run
    from agents a left join agent_runs r on r.agent_id = a.id group by a.id order by a.sort_order`)).rows as any[];
  return <Card tight title="Agent performance" sub="Execution history per agent. Approval acceptance shows how often you agree with proposals.">
    <div className="table-wrap"><table className="t"><thead><tr><th>Agent</th><th>Mode</th><th>Runs</th><th>Completed</th><th>Failed</th><th>Simulated</th><th>Approvals ✓/✗</th><th>Acceptance</th><th>Tasks created</th><th>Last run</th></tr></thead><tbody>
      {rows.map((r) => { const dec = r.approved + r.rejected; return <tr key={r.id}><td><Link className="title" href={`/agents/${r.id}`}>{r.name}</Link></td><td><Badge tone="outline">{r.autonomy_mode}</Badge></td><td className="num">{r.runs}</td><td className="num">{r.completed}</td><td className="num">{r.failed}</td><td className="num">{r.simulated}</td><td className="num">{r.approved}/{r.rejected}</td><td className="num">{dec ? Math.round((r.approved / dec) * 100) + "%" : "—"}</td><td className="num">{r.tasks_created}</td><td className="small muted">{r.last_run ? ago(r.last_run) : "never"}</td></tr>; })}
    </tbody></table></div></Card>;
}

async function Notifications() {
  const rows = await db.select().from(S.notifications).orderBy(desc(S.notifications.createdAt)).limit(100);
  return <Card tight title="Notifications" actions={rows.some((r) => !r.readAt) ? <form action={markAllRead}><Submit className="btn sm">Mark all read</Submit></form> : null}>
    {rows.length ? <div className="list">{rows.map((n) => <div key={n.id} className="li" style={{ opacity: n.readAt ? 0.6 : 1 }}>
      <Badge tone={n.level === "critical" ? "bad" : n.level === "warning" ? "warn" : n.level === "success" ? "good" : "outline"}>{n.level}</Badge>
      <div className="grow"><div className="ttl">{n.link ? <Link className="link" href={n.link}>{n.title}</Link> : n.title} <Demo on={n.isDemo} /></div>{n.body ? <div className="small pre muted" style={{ marginTop: 3 }}>{n.body}</div> : null}<div className="meta">{ago(n.createdAt)}</div></div></div>)}</div> : <Empty title="No notifications" />}
  </Card>;
}
