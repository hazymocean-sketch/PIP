import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { deleteWorkflow, runWorkflowNow, toggleWorkflow } from "@/server/actions";
import { refOptions } from "@/server/entities";
import { WorkflowForm } from "@/components/workflow-form";
import { Submit } from "@/components/client";
import { Card, DeleteForm, Demo, Empty, Flash, PageHead, StatusBadge, ago, Badge } from "@/components/ui";

export default async function WfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [wf] = await db.select().from(S.workflows).where(eq(S.workflows.id, id));
  if (!wf) notFound();
  const ventures = await db.select({ id: S.ventures.id, name: S.ventures.name }).from(S.ventures).orderBy(S.ventures.sortOrder);
  const runs = await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.workflowId, id)).orderBy(desc(S.workflowRuns.createdAt)).limit(30);
  const [projects, opps] = await Promise.all([refOptions("projects"), refOptions("opportunities")]);
  return (<>
    <PageHead title={<>{wf.name} <Demo on={wf.isDemo} /></>} crumbs={[{ href: "/automations", label: "Workflows" }]} sub={wf.description}
      actions={<form action={toggleWorkflow.bind(null, id, !wf.enabled)}><Submit className={wf.enabled ? "btn" : "btn good"}>{wf.enabled ? "Disable" : "Enable"}</Submit></form>} />
    <Flash sp={sp} />
    <div className="split"><div className="stack"><WorkflowForm wf={wf} ventures={ventures} /></div>
    <div className="stack">
      <Card title="Run manually" sub="Optionally against a specific record">
        <form action={runWorkflowNow.bind(null, id)} className="stack" style={{ gap: 8 }}>
          <select name="entityType" defaultValue=""><option value="">No record</option><option value="project">Project</option><option value="opportunity">Opportunity</option></select>
          <select name="entityId" defaultValue=""><option value="">—</option><optgroup label="Projects">{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup><optgroup label="Opportunities">{opps.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup></select>
          <Submit pendingText="Running…">Run now</Submit>
        </form>
      </Card>
      <Card title="Execution log" tight>{runs.length ? <div className="list">{runs.map((r) => <Link key={r.id} href={`/automations/runs/${r.id}`} className="li"><div className="grow"><div className="ttl small">{(r.trigger as any)?.source ?? "manual"}</div><div className="meta">attempt {r.attempt} · {ago(r.createdAt)}</div>{r.error ? <div className="meta" style={{ color: "var(--red)" }}>{r.error}</div> : null}</div><StatusBadge value={r.status} opts={C.RUN_STATUS.concat([{ value: "skipped", label: "Skipped" }])} /></Link>)}</div> : <Empty title="No runs yet" />}</Card>
      <Card title="Delete"><DeleteForm action={deleteWorkflow.bind(null, id)} /></Card>
      <Card title="Mode"><Badge tone="outline">{wf.mode}</Badge><p className="muted small" style={{ marginTop: 6 }}>In assist mode, field updates become approval requests and agents run in assist mode.</p></Card>
    </div></div>
  </>);
}
