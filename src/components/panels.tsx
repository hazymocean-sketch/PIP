import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { SOURCE_FIELDS } from "@/lib/fields";
import * as C from "@/lib/constants";
import { addSource, completeTask, deleteSource, runAgentAction } from "@/server/actions";
import { Card, Demo, Empty, InfoBadge, StatusBadge, fmtDate, Badge } from "./ui";
import { FormFields } from "./fields";
import { Submit } from "./client";

type Target = { projectId?: string; companyId?: string; contactId?: string; opportunityId?: string; discoveryId?: string; researchSessionId?: string };

export async function SourcesPanel({ target, back }: { target: Target; back: string }) {
  const [[k, v]] = Object.entries(target) as [keyof Target, string][];
  const col = { projectId: S.sources.projectId, companyId: S.sources.companyId, contactId: S.sources.contactId, opportunityId: S.sources.opportunityId, discoveryId: S.sources.discoveryId, researchSessionId: S.sources.researchSessionId }[k];
  const rows = await db.select().from(S.sources).where(eq(col, v)).orderBy(desc(S.sources.createdAt));
  return (
    <Card title="Sources & evidence" sub="Every important fact should trace back to a source. Status: Confirmed = verified; Reported = stated by a source but not independently checked; Inference = analyst/AI deduction, never treated as fact; Unknown = not established." tight id="sources">
      {rows.length ? <div className="list">{rows.map((s) => (
        <div key={s.id} className="li">
          <div className="grow">
            <div className="ttl">{s.url ? <a className="link" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.sourceName || s.url}</a> : (s.title || s.sourceName || "Note")} <Demo on={s.isDemo} /></div>
            <div className="meta">{s.sourceName ?? "Unknown source"} · published {fmtDate(s.publishedAt) ?? "unknown"} · accessed {fmtDate(s.accessedAt)}{s.supportsField ? ` · supports: ${s.supportsField}` : ""}</div>
            {s.extractedInfo ? <div className="small pre" style={{ marginTop: 4, color: "var(--text-2)" }}>{s.extractedInfo}</div> : null}
          </div>
          <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
            <InfoBadge value={s.infoStatus} />
            <form action={deleteSource.bind(null, s.id, back)}><button className="btn ghost sm" type="submit">Remove</button></form>
          </div>
        </div>))}</div> : <Empty title="No sources yet">Add the article, announcement or note that supports this record.</Empty>}
      <details style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
        <summary>Add source</summary>
        <form action={addSource} style={{ marginTop: 10 }}>
          <input type="hidden" name="_back" value={back} />
          <input type="hidden" name={k} value={v} />
          <FormFields fields={SOURCE_FIELDS} values={{ infoStatus: "reported", accessedAt: new Date().toISOString().slice(0, 10) }} />
          <div className="form-foot"><Submit>Add source</Submit></div>
        </form>
      </details>
    </Card>
  );
}

export async function TasksPanel({ where, back, newHref }: { where: ReturnType<typeof eq>; back: string; newHref: string }) {
  const rows = await db.select().from(S.tasks).where(where).orderBy(S.tasks.status, S.tasks.dueDate).limit(30);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card title="Tasks & follow-ups" tight actions={<Link className="btn sm" href={newHref}>Add task</Link>}>
      {rows.length ? <div className="list">{rows.map((t) => (
        <div key={t.id} className="li">
          <div className="grow"><div className="ttl" style={t.status === "done" ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.title} <Demo on={t.isDemo} />{t.createdByAgentId ? <> <Badge tone="info">agent</Badge></> : null}{t.workflowRunId ? <> <Badge tone="info">workflow</Badge></> : null}</div>
            <div className="meta">{C.label(C.PRIORITY, t.priority)} · {t.dueDate ? <span style={{ color: t.dueDate < today && t.status !== "done" ? "var(--red)" : undefined }}>due {fmtDate(t.dueDate)}</span> : "no due date"}</div></div>
          <StatusBadge value={t.status} opts={C.TASK_STATUS} />
          {t.status !== "done" ? <form action={completeTask.bind(null, t.id, back)}><button className="btn ghost sm" type="submit">Done</button></form> : null}
        </div>))}</div> : <Empty title="No tasks" />}
    </Card>
  );
}

export async function ActivitiesPanel({ where, newHref }: { where: ReturnType<typeof eq>; newHref: string }) {
  const rows = await db.select().from(S.activities).where(where).orderBy(desc(S.activities.occurredAt)).limit(30);
  return (
    <Card title="Meetings & activities" tight actions={<Link className="btn sm" href={newHref}>Log activity</Link>}>
      {rows.length ? <div className="list">{rows.map((a) => (
        <Link key={a.id} href={`/activities/${a.id}/edit`} className="li">
          <div className="grow"><div className="ttl">{a.subject} <Demo on={a.isDemo} /></div><div className="meta">{C.label(C.ACTIVITY_TYPE, a.type)} · {fmtDate(a.occurredAt, true)}</div>
            {a.outcome ? <div className="small" style={{ marginTop: 3, color: "var(--text-2)" }}>{a.outcome}</div> : null}</div>
        </Link>))}</div> : <Empty title="No activity logged" />}
    </Card>
  );
}

export function AgentButton({ agentKey, label, targetType, targetId, instruction, ventureId, back }: { agentKey: string; label: string; targetType?: string; targetId?: string; instruction: string; ventureId?: string | null; back: string }) {
  return (
    <form action={runAgentAction}>
      <input type="hidden" name="agentKey" value={agentKey} />
      <input type="hidden" name="instruction" value={instruction} />
      {targetType ? <input type="hidden" name="targetType" value={targetType} /> : null}
      {targetId ? <input type="hidden" name="targetId" value={targetId} /> : null}
      {ventureId ? <input type="hidden" name="ventureId" value={ventureId} /> : null}
      <input type="hidden" name="_back" value={back} />
      <Submit className="btn" pendingText="Agent running…">{label}</Submit>
    </form>
  );
}
