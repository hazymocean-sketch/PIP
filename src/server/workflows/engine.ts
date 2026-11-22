/**
 * Workflow engine.
 *
 * Triggers: manual · schedule (hour/day/week) · event (from the events outbox).
 * Steps: condition, create_task, schedule_follow_up, notify, escalate,
 *        request_approval, run_agent, update_field.
 * Reliability: every step is logged; failures retry with exponential backoff up to
 * max_retries, then the run is marked failed and escalated as a notification.
 * Mode: in "assist" mode, update_field becomes an approval request instead of a write.
 */
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  approvals, discoveries, events, newsItems, opportunities, projects, tasks, workflowRunLogs, workflowRuns, workflows,
  type WorkflowStep,
} from "@/db/schema";
import { addDays, notify, renderTemplate } from "@/server/core";

type Run = typeof workflowRuns.$inferSelect;
type Workflow = typeof workflows.$inferSelect;
type Cond = { field: string; op: string; value: unknown };

const ENTITY_TABLES: Record<string, any> = { project: projects, opportunity: opportunities, discovery: discoveries, news: newsItems, task: tasks };
/** Fields a workflow may change on each entity type. */
const UPDATABLE: Record<string, string[]> = {
  project: ["status", "verificationStatus", "developmentStage", "procurementStage"],
  opportunity: ["priority", "qualificationStatus", "commercialStatus", "nextAction", "followUpDate"],
  discovery: ["status"],
  task: ["status", "priority"],
};

export function evaluate(cond: Cond, entity: Record<string, any>): boolean {
  const v = cond.field.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), entity);
  switch (cond.op) {
    case "eq": return String(v) === String(cond.value);
    case "neq": return String(v) !== String(cond.value);
    case "in": return Array.isArray(cond.value) && cond.value.map(String).includes(String(v));
    case "gte": return Number(v) >= Number(cond.value);
    case "lte": return Number(v) <= Number(cond.value);
    case "contains": return String(v ?? "").toLowerCase().includes(String(cond.value).toLowerCase());
    case "exists": return v !== null && v !== undefined && v !== "";
    case "not_exists": return v === null || v === undefined || v === "";
    default: return false;
  }
}

/** Schedules are expressed in Dubai time (UTC+4, no DST) regardless of the server's timezone. */
const DUBAI_OFFSET_MS = 4 * 3600_000;
export function nextScheduledRun(schedule: Workflow["schedule"], from = new Date()): Date | null {
  if (!schedule) return null;
  if (schedule.every === "hour") { const d = new Date(from); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); return d; }
  const local = new Date(from.getTime() + DUBAI_OFFSET_MS); // "wall clock" in Dubai, read with UTC getters
  const [hh, mm] = (schedule.at ?? "08:00").split(":").map(Number);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm, 0, 0));
  if (schedule.every === "day") { if (d <= local) d.setUTCDate(d.getUTCDate() + 1); }
  else { const target = schedule.weekday ?? 1; while (d.getUTCDay() !== target || d <= local) d.setUTCDate(d.getUTCDate() + 1); }
  return new Date(d.getTime() - DUBAI_OFFSET_MS);
}

async function log(run: Run, message: string, level: "info" | "warning" | "error" | "success" = "info", stepIndex?: number, stepType?: string) {
  await db.insert(workflowRunLogs).values({ runId: run.id, message, level, stepIndex, stepType, attempt: run.attempt });
}

async function loadEntity(type: string | undefined, id: string | undefined) {
  if (!type || !id || !ENTITY_TABLES[type]) return null;
  const t = ENTITY_TABLES[type];
  const [row] = await db.select().from(t).where(eq(t.id, id));
  return (row as Record<string, unknown>) ?? null;
}

export async function startWorkflowRun(workflowId: string, trigger: Record<string, unknown>) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow not found");
  const entityType = trigger.entityType as string | undefined;
  const entityId = trigger.entityId as string | undefined;
  const entity = await loadEntity(entityType, entityId);
  const [run] = await db.insert(workflowRuns).values({
    workflowId, status: "running", trigger, context: { entityType, entityId, entity }, startedAt: new Date(),
  }).returning();
  await log(run, `Started (${String(trigger.source ?? "manual")})${entity ? ` for ${entityType} “${(entity as any).name ?? (entity as any).title}”` : ""}.`);
  // Workflow-level conditions
  for (const c of wf.conditions ?? []) {
    if (!evaluate(c, (entity ?? {}) as Record<string, any>)) {
      await log(run, `Condition not met: ${c.field} ${c.op} ${JSON.stringify(c.value)} → skipped.`);
      await db.update(workflowRuns).set({ status: "skipped", finishedAt: new Date() }).where(eq(workflowRuns.id, run.id));
      return { ...run, status: "skipped" };
    }
  }
  return executeRun(run.id);
}

export async function executeRun(runId: string) {
  let [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, run.workflowId));
  const ctx = (run.context ?? {}) as { entityType?: string; entityId?: string; entity?: Record<string, any> | null; vars?: Record<string, unknown> };
  const tctx = { entity: ctx.entity ?? {}, workflow: { name: wf.name }, today: new Date().toISOString().slice(0, 10) };
  await db.update(workflowRuns).set({ status: "running" }).where(eq(workflowRuns.id, runId));

  for (let i = run.currentStep; i < wf.steps.length; i++) {
    const step = wf.steps[i] as WorkflowStep;
    const cfg = step.config as Record<string, any>;
    try {
      const outcome = await runStep(run, wf, step, cfg, ctx, tctx, i);
      if (outcome === "stop") {
        await db.update(workflowRuns).set({ status: "completed", currentStep: i + 1, finishedAt: new Date() }).where(eq(workflowRuns.id, runId));
        return { ...run, status: "completed" };
      }
      if (outcome === "wait") {
        await db.update(workflowRuns).set({ status: "awaiting_approval", currentStep: i + 1 }).where(eq(workflowRuns.id, runId));
        return { ...run, status: "awaiting_approval" };
      }
      await db.update(workflowRuns).set({ currentStep: i + 1 }).where(eq(workflowRuns.id, runId));
    } catch (e) {
      const msg = (e as Error).message;
      await log(run, `Step failed: ${msg}`, "error", i, step.type);
      if (run.attempt <= wf.maxRetries) {
        const delayMin = 2 ** run.attempt;
        await db.update(workflowRuns).set({ status: "retrying", currentStep: i, attempt: run.attempt + 1, error: msg, nextAttemptAt: new Date(Date.now() + delayMin * 60000) }).where(eq(workflowRuns.id, runId));
        await log(run, `Will retry in ${delayMin} min (attempt ${run.attempt + 1} of ${wf.maxRetries + 1}).`, "warning", i, step.type);
        return { ...run, status: "retrying" };
      }
      await db.update(workflowRuns).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(workflowRuns.id, runId));
      await notify(`Workflow failed: ${wf.name}`, msg, "critical", `/automations/${wf.id}`);
      return { ...run, status: "failed" };
    }
    [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  }
  await db.update(workflowRuns).set({ status: "completed", finishedAt: new Date() }).where(eq(workflowRuns.id, runId));
  await log(run, "Completed.", "success");
  return { ...run, status: "completed" };
}

async function runStep(run: Run, wf: Workflow, step: WorkflowStep, cfg: Record<string, any>, ctx: any, tctx: Record<string, any>, i: number): Promise<"next" | "stop" | "wait"> {
  const link = linkFor(ctx.entityType, ctx.entityId);
  switch (step.type) {
    case "condition": {
      const ok = evaluate(cfg as Cond, ctx.entity ?? {});
      await log(run, `Condition ${cfg.field} ${cfg.op} ${JSON.stringify(cfg.value)} → ${ok ? "true" : "false, stopping"}.`, "info", i, step.type);
      return ok ? "next" : "stop";
    }
    case "create_task":
    case "schedule_follow_up": {
      const title = renderTemplate(cfg.title ?? "Follow up", tctx);
      const due = addDays(Number(cfg.dueInDays ?? cfg.daysFromNow ?? 3));
      await db.insert(tasks).values({
        title, description: cfg.description ? renderTemplate(cfg.description, tctx) : `Created by workflow “${wf.name}”.`,
        priority: cfg.priority ?? "medium", dueDate: due, workflowRunId: run.id, ...entityFk(ctx.entityType, ctx.entityId),
      });
      if (step.type === "schedule_follow_up" && ctx.entityType === "opportunity") {
        await db.update(opportunities).set({ followUpDate: due, updatedAt: new Date() }).where(eq(opportunities.id, ctx.entityId));
      }
      await log(run, `Created task “${title}” due ${due}.`, "success", i, step.type);
      return "next";
    }
    case "notify":
    case "escalate": {
      const title = renderTemplate(cfg.title ?? wf.name, tctx);
      await notify(title, cfg.body ? renderTemplate(cfg.body, tctx) : null, step.type === "escalate" ? "critical" : (cfg.level ?? "info"), link);
      if (step.type === "escalate") {
        await db.insert(tasks).values({ title: `ESCALATION: ${title}`, priority: "urgent", dueDate: addDays(0), workflowRunId: run.id, ...entityFk(ctx.entityType, ctx.entityId) });
      }
      await log(run, `${step.type === "escalate" ? "Escalated" : "Notified"}: ${title}`, "success", i, step.type);
      return "next";
    }
    case "request_approval": {
      await db.insert(approvals).values({
        kind: cfg.kind ?? "workflow_gate", title: renderTemplate(cfg.title ?? `Approve next steps of ${wf.name}`, tctx),
        description: cfg.description ?? null, riskLevel: cfg.risk ?? "medium", workflowRunId: run.id, ventureId: wf.ventureId,
        payload: { entityType: ctx.entityType, entityId: ctx.entityId },
      });
      await log(run, "Waiting for human approval.", "warning", i, step.type);
      return "wait";
    }
    case "run_discovery": {
      const { runDiscovery } = await import("@/server/research");
      const loc = (cfg.location as string) || "UAE";
      const r = await runDiscovery({ title: renderTemplate(cfg.title ?? `Scheduled discovery — ${loc}`, tctx), query: (cfg.query as string) ?? null, sectorId: null,
        location: loc, dateFrom: null, dateTo: null, template: cfg.template === "custom" ? "custom" : "hotels" });
      if (!r.provider) { await log(run, "No search provider connected — discovery session prepared for manual work.", "warning", i, step.type); return "next"; }
      if (r.errors.length && !r.created) throw new Error(`Search failed: ${r.errors[0]}`);
      await log(run, `Discovery (${loc}): ${r.created} new, ${r.skipped} duplicates skipped${r.errors.length ? `, ${r.errors.length} query errors` : ""}.`, "success", i, step.type);
      if (r.created) await notify(`${r.created} new discoveries (${loc})`, "Review them in Discover.", "info", "/discoveries");
      return "next";
    }
    case "run_agent": {
      const { startAgentRun } = await import("@/server/agents/runner");
      const r = await startAgentRun({
        agentKey: cfg.agentKey, instruction: renderTemplate(cfg.instruction ?? "", tctx), ventureId: wf.ventureId,
        targetType: ctx.entityType ?? null, targetId: ctx.entityId ?? null, triggeredBy: "workflow", workflowRunId: run.id,
        modeOverride: wf.mode === "assist" ? "assist" : null,
      });
      if (r.status === "failed") throw new Error(`Agent run failed: ${r.summary}`);
      await log(run, `Agent ${cfg.agentKey}: ${r.summary}`, "success", i, step.type);
      return "next";
    }
    case "update_field": {
      const allowed = UPDATABLE[ctx.entityType ?? ""] ?? [];
      if (!allowed.includes(cfg.field)) throw new Error(`Field ${cfg.field} cannot be updated on ${ctx.entityType}`);
      if (wf.mode === "assist") {
        await db.insert(approvals).values({
          kind: "internal_change", title: `Set ${cfg.field} = ${cfg.value} on ${(ctx.entity?.name ?? ctx.entity?.title) || ctx.entityType}`,
          riskLevel: "medium", workflowRunId: run.id, ventureId: wf.ventureId, payload: { entityType: ctx.entityType, entityId: ctx.entityId, field: cfg.field, value: cfg.value },
        });
        await log(run, `Assist mode — update of ${cfg.field} sent for approval.`, "warning", i, step.type);
        return "wait";
      }
      const t = ENTITY_TABLES[ctx.entityType];
      await db.update(t).set({ [cfg.field]: cfg.value, updatedAt: new Date() }).where(eq(t.id, ctx.entityId));
      await log(run, `Updated ${cfg.field} → ${cfg.value}.`, "success", i, step.type);
      return "next";
    }
    default:
      throw new Error(`Unknown step type ${(step as WorkflowStep).type}`);
  }
}

function entityFk(type?: string, id?: string) {
  if (!type || !id) return {};
  if (type === "project") return { projectId: id };
  if (type === "opportunity") return { opportunityId: id };
  return {};
}

function linkFor(type?: string, id?: string) {
  if (!type || !id) return null;
  return ({ project: `/projects/${id}`, opportunity: `/opportunities/${id}`, discovery: `/discoveries/${id}`, news: `/news`, task: `/tasks` } as Record<string, string>)[type] ?? null;
}

export async function resumeAfterApproval(runId: string, decision: "approved" | "rejected") {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  if (!run || run.status !== "awaiting_approval") return;
  const pending = await db.select().from(approvals).where(and(eq(approvals.workflowRunId, runId), eq(approvals.status, "pending")));
  if (pending.length) return;
  if (decision === "rejected") {
    await db.update(workflowRuns).set({ status: "cancelled", finishedAt: new Date() }).where(eq(workflowRuns.id, runId));
    await log(run, "Approval rejected — run cancelled.", "warning");
    return;
  }
  // Apply an approved field update captured in the approval payload
  const [last] = await db.select().from(approvals).where(eq(approvals.workflowRunId, runId)).orderBy(sql`${approvals.decidedAt} desc nulls last`).limit(1);
  const p = (last?.payload ?? {}) as { entityType?: string; entityId?: string; field?: string; value?: unknown };
  if (last?.kind === "internal_change" && p.field && p.entityType && ENTITY_TABLES[p.entityType] && (UPDATABLE[p.entityType] ?? []).includes(p.field)) {
    const t = ENTITY_TABLES[p.entityType];
    await db.update(t).set({ [p.field]: p.value, updatedAt: new Date() }).where(eq(t.id, p.entityId));
    await log(run, `Approved update applied: ${p.field} → ${String(p.value)}.`, "success");
  } else {
    await log(run, "Approved — continuing.", "success");
  }
  await executeRun(runId);
}

/** Match unprocessed events to enabled event-triggered workflows. */
export async function processEvents(limit = 50) {
  const pending = await db.select().from(events).where(isNull(events.processedAt)).orderBy(events.createdAt).limit(limit);
  let started = 0;
  for (const ev of pending) {
    // Claim the event atomically so concurrent ticks don't double-process it
    const claimed = await db.update(events).set({ processedAt: new Date() }).where(and(eq(events.id, ev.id), isNull(events.processedAt))).returning();
    if (!claimed.length) continue;
    const wfs = await db.select().from(workflows).where(and(eq(workflows.enabled, true), eq(workflows.triggerType, "event"), eq(workflows.eventType, ev.type)));
    for (const wf of wfs) {
      await startWorkflowRun(wf.id, { source: `event:${ev.type}`, eventId: ev.id, entityType: ev.entityType, entityId: ev.entityId, ...(ev.payload as object) });
      started++;
    }
  }
  return started;
}

/** Called by /api/cron/tick (Vercel Cron) or the "Run tick now" button. */
export async function tick(now = new Date()) {
  const result = { events: 0, scheduled: 0, retried: 0, overdueEvents: 0 };
  // 1. Emit task.overdue once per task
  const overdue = await db.execute(sql`select t.id, t.title from tasks t where t.due_date < current_date and t.status in ('open','in_progress')
    and not exists (select 1 from events e where e.type = 'task.overdue' and e.entity_id = t.id)`);
  for (const t of overdue.rows as { id: string; title: string }[]) {
    await db.insert(events).values({ type: "task.overdue", entityType: "task", entityId: t.id, payload: { title: t.title } });
    result.overdueEvents++;
  }
  // 2. Events
  result.events = await processEvents(200);
  // 3. Scheduled workflows
  const due = await db.select().from(workflows).where(and(eq(workflows.enabled, true), eq(workflows.triggerType, "schedule"), or(isNull(workflows.nextRunAt), lte(workflows.nextRunAt, now))));
  for (const wf of due) {
    await db.update(workflows).set({ nextRunAt: nextScheduledRun(wf.schedule, now) }).where(eq(workflows.id, wf.id));
    if (wf.nextRunAt === null) continue; // first tick only sets the schedule
    await startWorkflowRun(wf.id, { source: "schedule" });
    result.scheduled++;
  }
  // 4. Retries
  const retries = await db.select().from(workflowRuns).where(and(eq(workflowRuns.status, "retrying"), lte(workflowRuns.nextAttemptAt, now)));
  for (const r of retries) { await executeRun(r.id); result.retried++; }
  return result;
}
