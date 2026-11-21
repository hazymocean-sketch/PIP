import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { retryWorkflowRun } from "@/server/actions";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Flash, PageHead, StatusBadge, fmtDate } from "@/components/ui";

export default async function WfRun({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [r] = await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.id, id));
  if (!r) notFound();
  const [wf] = await db.select().from(S.workflows).where(eq(S.workflows.id, r.workflowId));
  const logs = await db.select().from(S.workflowRunLogs).where(eq(S.workflowRunLogs.runId, id)).orderBy(asc(S.workflowRunLogs.createdAt));
  const ctx = (r.context ?? {}) as any;
  return (<>
    <PageHead title={`Run: ${wf?.name}`} crumbs={[{ href: "/automations", label: "Workflows" }, { href: `/automations/${r.workflowId}`, label: wf?.name ?? "Workflow" }]}
      sub={<span className="row"><StatusBadge value={r.status} opts={C.RUN_STATUS.concat([{ value: "skipped", label: "Skipped" }])} /><Demo on={r.isDemo} /><span className="muted small">{fmtDate(r.createdAt, true)} · attempt {r.attempt} · step {r.currentStep}/{wf?.steps.length}</span></span>}
      actions={["failed", "retrying"].includes(r.status) ? <form action={retryWorkflowRun.bind(null, id)}><Submit className="btn">Retry now</Submit></form> : r.status === "awaiting_approval" ? <Link className="btn" href="/command?tab=approvals">Go to approvals</Link> : null} />
    <Flash sp={sp} />
    {r.error ? <div className="flash error">{r.error}</div> : null}
    <div className="split">
      <Card title="Log" tight><ol className="steps">{logs.map((l, i) => <li key={l.id}><span className="n">{i + 1}</span><span className="k"><Badge tone={l.level === "error" ? "bad" : l.level === "warning" ? "warn" : l.level === "success" ? "good" : "outline"}>{l.stepType ?? l.level}</Badge></span><div>{l.message} <span className="faint small">· attempt {l.attempt}</span></div></li>)}</ol></Card>
      <Card title="Trigger & context"><pre className="json">{JSON.stringify({ trigger: r.trigger, entityType: ctx.entityType, entityId: ctx.entityId, entity: ctx.entity ? { name: ctx.entity.name, title: ctx.entity.title, status: ctx.entity.status } : null }, null, 2)}</pre></Card>
    </div>
  </>);
}
