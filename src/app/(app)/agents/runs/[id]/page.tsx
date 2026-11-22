import { isUuid } from "@/lib/normalize";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { decideApprovalAction } from "@/server/actions";
import { TOOLS } from "@/server/agents/tools";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Flash, PageHead, Sim, StatusBadge, fmtDate } from "@/components/ui";

const KIND_TONE: Record<string, "good" | "warn" | "bad" | "info" | "sim" | "outline" | ""> = { start: "outline", plan: "", tool_result: "good", tool_error: "bad", approval_requested: "warn", approved: "good", rejected: "bad", blocked: "bad", finish: "info", error: "bad", warning: "warn", insight: "info" };

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [r] = await db.select().from(S.agentRuns).where(eq(S.agentRuns.id, id));
  if (!r) notFound();
  const [a] = await db.select().from(S.agents).where(eq(S.agents.id, r.agentId));
  const steps = await db.select().from(S.agentRunSteps).where(eq(S.agentRunSteps.runId, id)).orderBy(asc(S.agentRunSteps.seq));
  const appr = await db.select().from(S.approvals).where(eq(S.approvals.agentRunId, id));
  const targetHref = r.targetType && r.targetId ? `/${r.targetType === "opportunity" ? "opportunities" : r.targetType + "s"}/${r.targetId}` : null;
  return (<>
    <PageHead title={`${a?.name ?? "Agent"} run`} crumbs={[{ href: "/agents", label: "Agents" }, { href: `/agents/${r.agentId}`, label: a?.name ?? "Agent" }]}
      sub={<span className="row"><StatusBadge value={r.status} opts={C.RUN_STATUS} /><Sim on={r.isSimulated} /><Demo on={r.isDemo} /><Badge tone="outline">{r.mode}</Badge><Badge tone="outline">planner: {r.planner}</Badge><span className="muted small">{fmtDate(r.createdAt, true)} · triggered by {r.triggeredBy}</span></span>}
      actions={targetHref ? <Link className="btn" href={targetHref}>Open target</Link> : null} />
    <Flash sp={sp} />
    {r.isSimulated ? <div className="notice sim" style={{ marginBottom: 14 }}>Part of this run was SIMULATED: an external integration it needed is not connected. Simulated steps made no outside calls and created no data presented as research.</div> : null}
    <div className="split"><div className="stack">
      <Card title="Instruction"><div className="pre">{r.instruction}</div>{r.summary ? <><hr className="sep" /><strong className="small">Result</strong><div className="pre" style={{ marginTop: 4 }}>{r.summary}</div></> : null}{r.error ? <div className="flash error" style={{ marginTop: 10 }}>{r.error}</div> : null}</Card>
      <Card title="Execution log" tight><ol className="steps">{steps.map((s) => (
        <li key={s.id}><span className="n">{s.seq}</span><span className="k"><Badge tone={KIND_TONE[s.kind] ?? ""}>{s.kind.replace(/_/g, " ")}</Badge></span>
          <div><div>{s.tool ? <code>{TOOLS[s.tool]?.label ?? s.tool}</code> : null} {s.message} {s.isSimulated ? <Sim on /> : null}</div>
            {s.input || s.output ? <details><summary>Data</summary><pre className="json">{JSON.stringify({ input: s.input ?? undefined, output: s.output ?? undefined }, null, 2)}</pre></details> : null}</div></li>))}</ol></Card>
    </div><div className="stack">
      <Card title="Approvals in this run" tight>{appr.length ? <div className="list">{appr.map((ap) => <div key={ap.id} className="li" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="ttl small">{ap.title}</span><StatusBadge value={ap.status} opts={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} /></div>
        {ap.status === "pending" ? <div className="row" style={{ marginTop: 6 }}><form action={decideApprovalAction.bind(null, ap.id, "approved")}><input type="hidden" name="_back" value={`/agents/runs/${id}`} /><Submit className="btn good sm">Approve</Submit></form><form action={decideApprovalAction.bind(null, ap.id, "rejected")}><input type="hidden" name="_back" value={`/agents/runs/${id}`} /><Submit className="btn danger sm">Reject</Submit></form></div>
          : <div className="meta">{(ap.executionResult as any)?.message ?? ap.decisionNote ?? ""}</div>}
      </div>)}</div> : <div className="card-b muted small">No approvals were needed.</div>}</Card>
    </div></div>
  </>);
}
