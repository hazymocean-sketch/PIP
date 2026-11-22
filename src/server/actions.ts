"use server";
/**
 * Server actions. Every action starts with requireAdmin() — authorization is
 * enforced here on the server, not by hiding UI.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as form from "@/lib/form";
import * as C from "@/lib/constants";
import { computeScore } from "@/lib/scoring";
import { slugify } from "@/lib/normalize";
import { SOURCE_FIELDS } from "@/lib/fields";
import { requireAdmin, SESSION_COOKIE } from "./auth";
import { authCore } from "./auth-core";
import { ENTITIES, createRecord, deleteRecord, parseFields, updateRecord, type EntityKey } from "./entities";
import { emitEvent, safeDelete } from "./core";
import { CHECKLISTS, linkDiscoveryToProject, runDiscovery, saveDiscoveryAsProject } from "./research";
import { decideApproval, routeCommand, startAgentRun } from "./agents/runner";
import { executeRun, nextScheduledRun, startWorkflowRun, tick } from "./workflows/engine";
import { TOOLS } from "./agents/tools";

const msg = (e: unknown) => (e instanceof form.ValidationError ? e.message : "Something went wrong");
const withFlash = (path: string, k: "ok" | "error", m: string) => {
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(m)}${hash ? `#${hash}` : ""}`;
};

async function guarded<T>(fn: () => Promise<T>, errorPath: string): Promise<T> {
  try { return await fn(); } catch (e) {
    if (!(e instanceof form.ValidationError)) console.error(e);
    redirect(withFlash(errorPath, "error", msg(e)));
  }
}

/* ───────────── Generic entity CRUD ───────────── */

export async function saveEntity(key: EntityKey, id: string | null, fd: FormData) {
  await requireAdmin();
  const e = ENTITIES[key];
  const back = (fd.get("_back") as string) || (id ? e.path(id) : e.listPath);
  const errorPath = id ? `${e.path(id)}${e.path(id) === e.listPath ? "" : "/edit"}` : `${e.listPath}/new`;
  const row = await guarded(async () => {
    const values = parseFields(fd, e.fields);
    return id ? updateRecord(key, id, values) : createRecord(key, values);
  }, (fd.get("_errorBack") as string) || errorPath);
  revalidatePath(e.listPath);
  const dest = fd.get("_back") ? back : e.path(row.id);
  redirect(withFlash(dest, "ok", `${e.label} saved`));
}

export async function deleteEntity(key: EntityKey, id: string, fd: FormData) {
  await requireAdmin();
  const e = ENTITIES[key];
  const back = (fd.get("_back") as string) || e.listPath;
  if (!form.bool(fd, "confirm")) redirect(withFlash((fd.get("_errorBack") as string) || e.path(id), "error", "Tick the confirmation box to delete"));
  await deleteRecord(key, id);
  revalidatePath(e.listPath);
  redirect(withFlash(back, "ok", `${e.label} deleted (snapshot kept in audit log)`));
}

/* ───────────── Project relations ───────────── */

export async function setProjectVentures(projectId: string, fd: FormData) {
  await requireAdmin();
  const ids = form.uuids(fd, "ventureId");
  await db.delete(S.projectVentures).where(eq(S.projectVentures.projectId, projectId));
  for (const v of ids) {
    const relevance = form.str(fd, `relevance_${v}`, { max: 2000 });
    await db.insert(S.projectVentures).values({ projectId, ventureId: v, relevance });
  }
  await db.update(S.projects).set({ updatedAt: new Date() }).where(eq(S.projects.id, projectId));
  redirect(withFlash(`/projects/${projectId}`, "ok", "Venture relevance updated"));
}

export async function addProjectCompany(projectId: string, fd: FormData) {
  await requireAdmin();
  await guarded(async () => {
    let companyId = form.uuidOrNull(fd, "companyId");
    const role = form.oneOf(fd, "role", C.PROJECT_ROLES);
    const newName = form.str(fd, "newCompanyName", { max: 300 });
    if (!companyId && newName) {
      const c = await createRecord("companies", { name: newName, category: role, verificationStatus: "unverified" });
      companyId = c.id;
    }
    if (!companyId) throw new form.ValidationError("Choose a company or enter a new company name");
    await db.insert(S.projectCompanies).values({ projectId, companyId, role, notes: form.str(fd, "notes", { max: 1000 }) }).onConflictDoNothing();
  }, `/projects/${projectId}`);
  redirect(withFlash(`/projects/${projectId}`, "ok", "Company linked"));
}

export async function removeProjectCompany(projectId: string, companyId: string, role: string) {
  await requireAdmin();
  await db.delete(S.projectCompanies).where(and(eq(S.projectCompanies.projectId, projectId), eq(S.projectCompanies.companyId, companyId), eq(S.projectCompanies.role, role)));
  redirect(withFlash(`/projects/${projectId}`, "ok", "Company unlinked"));
}

export async function addProjectContact(projectId: string, fd: FormData) {
  await requireAdmin();
  await guarded(async () => {
    const contactId = form.uuidOrNull(fd, "contactId");
    if (!contactId) throw new form.ValidationError("Choose a contact");
    await db.insert(S.projectContacts).values({ projectId, contactId, role: form.str(fd, "role", { max: 200 }) }).onConflictDoNothing();
  }, `/projects/${projectId}`);
  redirect(withFlash(`/projects/${projectId}`, "ok", "Contact linked"));
}

export async function removeProjectContact(projectId: string, contactId: string) {
  await requireAdmin();
  await db.delete(S.projectContacts).where(and(eq(S.projectContacts.projectId, projectId), eq(S.projectContacts.contactId, contactId)));
  redirect(withFlash(`/projects/${projectId}`, "ok", "Contact unlinked"));
}

export async function saveScore(projectId: string, fd: FormData) {
  await requireAdmin();
  const factors = await db.select().from(S.scoringFactors).orderBy(S.scoringFactors.sortOrder);
  const ratings: Record<string, number> = {};
  for (const f of factors) {
    const v = form.str(fd, `f_${f.key}`);
    if (v !== null) { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= 5) ratings[f.key] = n; }
  }
  const { score } = computeScore(factors, ratings);
  await db.update(S.projects).set({ scoreBreakdown: ratings, opportunityScore: Object.keys(ratings).length ? score : null, scoreNotes: form.str(fd, "scoreNotes"), updatedAt: new Date() }).where(eq(S.projects.id, projectId));
  redirect(withFlash(`/projects/${projectId}#score`, "ok", `Score saved: ${score}/100`));
}

export async function addOpportunityContact(opportunityId: string, fd: FormData) {
  await requireAdmin();
  const contactId = form.uuids(fd, "contactId")[0];
  if (contactId) await db.insert(S.opportunityContacts).values({ opportunityId, contactId }).onConflictDoNothing();
  redirect(withFlash(`/opportunities/${opportunityId}`, "ok", "Decision-maker linked"));
}

export async function removeOpportunityContact(opportunityId: string, contactId: string) {
  await requireAdmin();
  await db.delete(S.opportunityContacts).where(and(eq(S.opportunityContacts.opportunityId, opportunityId), eq(S.opportunityContacts.contactId, contactId)));
  redirect(withFlash(`/opportunities/${opportunityId}`, "ok", "Decision-maker unlinked"));
}

/* ───────────── Sources / evidence ───────────── */

const SOURCE_TARGETS = ["projectId", "companyId", "contactId", "opportunityId", "discoveryId", "researchSessionId"] as const;

export async function addSource(fd: FormData) {
  await requireAdmin();
  const back = (fd.get("_back") as string) || "/";
  await guarded(async () => {
    const v = parseFields(fd, SOURCE_FIELDS);
    if (!v.url && !v.extractedInfo) throw new form.ValidationError("Add a URL or the extracted information");
    const target: Record<string, string | null> = {};
    for (const t of SOURCE_TARGETS) target[t] = form.uuidOrNull(fd, t);
    if (!Object.values(target).some(Boolean)) throw new form.ValidationError("Source must be linked to a record");
    await createRecord("sources", { ...v, accessedAt: v.accessedAt ?? undefined, ...target });
    if (target.projectId) await db.update(S.projects).set({ updatedAt: new Date() }).where(eq(S.projects.id, target.projectId));
  }, back);
  redirect(withFlash(back, "ok", "Source added"));
}

export async function deleteSource(id: string, back: string) {
  await requireAdmin();
  await safeDelete(S.sources, "sources", id);
  redirect(withFlash(back, "ok", "Source removed"));
}

/* ───────────── Tasks quick actions ───────────── */

export async function completeTask(id: string, back: string) {
  await requireAdmin();
  await db.update(S.tasks).set({ status: "done", completedAt: new Date(), updatedAt: new Date() }).where(eq(S.tasks.id, id));
  revalidatePath("/tasks");
  redirect(withFlash(back, "ok", "Task completed"));
}

/* ───────────── Discoveries ───────────── */

export async function runDiscoveryAction(fd: FormData) {
  await requireAdmin();
  const res = await guarded(async () => runDiscovery({
    title: form.str(fd, "title") || `Discovery — ${form.str(fd, "query") || "hotels & resorts"}`,
    query: form.str(fd, "query", { max: 500 }), sectorId: form.uuidOrNull(fd, "sectorId"), location: form.str(fd, "location", { max: 100 }),
    dateFrom: form.dateStr(fd, "dateFrom"), dateTo: form.dateStr(fd, "dateTo"), template: form.str(fd, "template") === "hotels" ? "hotels" : "custom",
  }), "/discoveries");
  const note = res.provider ? `${res.created} new discoveries, ${res.skipped} duplicates skipped${res.errors.length ? `, ${res.errors.length} errors` : ""}` : "Manual mode: open the search links, then add what you find";
  redirect(withFlash(`/research/${res.session.id}`, "ok", note));
}

export async function addDiscovery(fd: FormData) {
  await requireAdmin();
  const back = (fd.get("_back") as string) || "/discoveries";
  const row = await guarded(async () => {
    const v = parseFields(fd, ENTITIES.discoveries.fields);
    return createRecord("discoveries", v, { researchSessionId: form.uuidOrNull(fd, "researchSessionId") });
  }, back);
  redirect(withFlash(`/discoveries/${row.id}`, "ok", "Discovery added — review duplicates below"));
}

export async function setDiscoveryStatus(id: string, status: "new" | "needs_verification" | "rejected", fd: FormData) {
  await requireAdmin();
  await db.update(S.discoveries).set({ status, rejectionReason: status === "rejected" ? form.str(fd, "reason", { max: 1000 }) : null, updatedAt: new Date() }).where(eq(S.discoveries.id, id));
  redirect(withFlash((fd.get("_back") as string) || `/discoveries/${id}`, "ok", status === "rejected" ? "Discovery rejected" : status === "needs_verification" ? "Flagged for verification" : "Reopened"));
}

export async function promoteDiscovery(id: string, fd: FormData) {
  await requireAdmin();
  const p = await guarded(async () => saveDiscoveryAsProject(id, { name: form.reqStr(fd, "name", 300), ventureIds: form.uuids(fd, "ventureId") }), `/discoveries/${id}`);
  redirect(withFlash(`/projects/${p.id}`, "ok", "Saved as project — source and discovery linked"));
}

export async function linkDiscovery(id: string, fd: FormData) {
  await requireAdmin();
  const projectId = form.uuids(fd, "projectId")[0];
  if (!projectId) redirect(withFlash(`/discoveries/${id}`, "error", "Choose a project"));
  await linkDiscoveryToProject(id, projectId);
  redirect(withFlash(`/projects/${projectId}`, "ok", "Discovery linked as evidence to existing project"));
}

/* ───────────── Research Center ───────────── */

export async function createResearchSession(fd: FormData) {
  await requireAdmin();
  const s = await guarded(async () => {
    const kind = form.oneOf(fd, "kind", C.RESEARCH_KIND);
    const projectId = form.uuidOrNull(fd, "projectId"), companyId = form.uuidOrNull(fd, "companyId");
    let title = form.str(fd, "title", { max: 300 });
    if (!title) {
      const [p] = projectId ? await db.select().from(S.projects).where(eq(S.projects.id, projectId)) : [];
      const [c] = companyId ? await db.select().from(S.companies).where(eq(S.companies.id, companyId)) : [];
      title = `${C.label(C.RESEARCH_KIND, kind)}${p ? ` — ${p.name}` : c ? ` — ${c.name}` : ""}`;
    }
    const [row] = await db.insert(S.researchSessions).values({ kind, title, query: form.str(fd, "query", { max: 2000 }), projectId, companyId,
      checklist: (CHECKLISTS[kind] ?? []).map((q) => ({ q })) }).returning();
    return row;
  }, "/research");
  redirect(withFlash(`/research/${s.id}`, "ok", "Research session opened"));
}

export async function saveResearchSession(id: string, fd: FormData) {
  await requireAdmin();
  const [s] = await db.select().from(S.researchSessions).where(eq(S.researchSessions.id, id));
  if (!s) redirect("/research");
  const checklist = (s.checklist ?? []).map((item, i) => ({
    q: item.q, answer: form.str(fd, `a_${i}`, { max: 5000 }) ?? undefined,
    basis: (() => { const b = form.str(fd, `b_${i}`); return b && C.INFO_STATUS.some((o) => o.value === b) ? b : "unknown"; })(),
  }));
  const status = form.str(fd, "status") === "completed" ? "completed" : "open";
  await db.update(S.researchSessions).set({ checklist, report: form.str(fd, "report", { max: 50000 }), status, updatedAt: new Date() }).where(eq(S.researchSessions.id, id));
  if (status === "completed" && s.projectId) {
    const [p] = await db.select().from(S.projects).where(eq(S.projects.id, s.projectId));
    if (p && ["new", "under_research"].includes(p.status)) await updateRecord("projects", p.id, { status: "research_completed" });
    await db.insert(S.activities).values({ type: "research", subject: `Research completed: ${s.title}`, projectId: s.projectId, notes: `See research session ${id}` });
  }
  redirect(withFlash(`/research/${id}`, "ok", status === "completed" ? "Research completed and linked to record" : "Research saved"));
}

/* ───────────── Agents & Command Centre ───────────── */

export async function runAgentAction(fd: FormData) {
  await requireAdmin();
  const back = (fd.get("_back") as string) || "/command";
  const res = await guarded(async () => startAgentRun({
    agentId: form.uuidOrNull(fd, "agentId") ?? undefined, agentKey: form.str(fd, "agentKey") ?? undefined,
    instruction: form.str(fd, "instruction", { max: 4000 }) ?? "", ventureId: form.uuidOrNull(fd, "ventureId"),
    targetType: form.str(fd, "targetType"), targetId: form.uuidOrNull(fd, "targetId"), triggeredBy: "user",
  }), back);
  redirect(withFlash(`/agents/runs/${res.runId}`, res.status === "failed" ? "error" : "ok", res.summary ?? res.status));
}

export async function sendCommand(fd: FormData) {
  await requireAdmin();
  const text = form.str(fd, "message", { max: 4000 });
  if (!text) redirect("/command");
  const pickedAgent = form.uuidOrNull(fd, "agentId");
  await db.insert(S.commandMessages).values({ role: "user", content: text });
  const route = await routeCommand(text);
  const [agent] = pickedAgent ? await db.select().from(S.agents).where(eq(S.agents.id, pickedAgent)) : await db.select().from(S.agents).where(eq(S.agents.key, route.agentKey));
  if (!agent) redirect(withFlash("/command", "error", "No agent available"));
  const ventureId = form.uuidOrNull(fd, "ventureId") ?? route.ventureId;
  const res = await startAgentRun({ agentId: agent.id, instruction: text, ventureId, targetType: route.project ? "project" : null, targetId: route.project?.id ?? null, triggeredBy: "command" });
  await db.insert(S.commandMessages).values({ role: "agent", agentId: agent.id, agentRunId: res.runId,
    content: `${pickedAgent ? "" : `Routed to ${agent.name}${route.project ? ` · target: ${route.project.name}` : ""}. `}${res.summary ?? res.status}` });
  redirect("/command");
}

export async function decideApprovalAction(id: string, decision: "approved" | "rejected", fd: FormData) {
  await requireAdmin();
  await decideApproval(id, decision, form.str(fd, "note", { max: 1000 }));
  await emitEvent("approval.decided", null, id, { decision });
  redirect(withFlash((fd.get("_back") as string) || "/command?tab=approvals", "ok", decision === "approved" ? "Approved and executed" : "Rejected"));
}

export async function updateAgent(id: string, fd: FormData) {
  await requireAdmin();
  await guarded(async () => {
    const tools = fd.getAll("tools").filter((t): t is string => typeof t === "string" && t in TOOLS);
    await db.update(S.agents).set({
      name: form.reqStr(fd, "name", 200), responsibility: form.reqStr(fd, "responsibility", 2000), instructions: form.str(fd, "instructions"),
      operatingRules: form.str(fd, "operatingRules"), autonomyMode: form.oneOf(fd, "autonomyMode", C.AUTONOMY_MODES),
      autonomyLimit: form.int(fd, "autonomyLimit", 0, 50) ?? 0, enabled: form.bool(fd, "enabled"), tools, updatedAt: new Date(),
    }).where(eq(S.agents.id, id));
    const ventureIds = form.uuids(fd, "ventureId");
    await db.delete(S.agentVentures).where(eq(S.agentVentures.agentId, id));
    for (const v of ventureIds) await db.insert(S.agentVentures).values({ agentId: id, ventureId: v });
  }, `/agents/${id}`);
  redirect(withFlash(`/agents/${id}`, "ok", "Agent configuration saved"));
}

/* ───────────── Workflows ───────────── */

function parseSteps(raw: string | null): S.WorkflowStep[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new form.ValidationError("Steps must be valid JSON"); }
  const allowed = ["condition", "create_task", "notify", "escalate", "request_approval", "run_agent", "update_field", "schedule_follow_up", "run_discovery"];
  if (!Array.isArray(parsed)) throw new form.ValidationError("Steps must be a JSON array");
  for (const s of parsed) {
    if (!s || typeof s !== "object" || !allowed.includes((s as any).type)) throw new form.ValidationError(`Invalid step type: ${(s as any)?.type}`);
    if (typeof (s as any).config !== "object") throw new form.ValidationError("Each step needs a config object");
  }
  return parsed as S.WorkflowStep[];
}

export async function saveWorkflow(id: string | null, fd: FormData) {
  await requireAdmin();
  const row = await guarded(async () => {
    const triggerType = form.oneOf(fd, "triggerType", [{ value: "manual", label: "" }, { value: "event", label: "" }, { value: "schedule", label: "" }]);
    const every = form.str(fd, "every") as "hour" | "day" | "week" | null;
    const schedule = triggerType === "schedule" ? { every: every ?? "day", at: form.str(fd, "at") ?? "08:00", weekday: form.int(fd, "weekday", 0, 6) ?? 1 } : null;
    let conditions: any[] = [];
    const rawCond = form.str(fd, "conditions");
    if (rawCond) { try { conditions = JSON.parse(rawCond); if (!Array.isArray(conditions)) throw 0; } catch { throw new form.ValidationError("Conditions must be a JSON array"); } }
    const values = {
      name: form.reqStr(fd, "name", 200), description: form.str(fd, "description"), ventureId: form.uuidOrNull(fd, "ventureId"), triggerType,
      eventType: triggerType === "event" ? form.oneOf(fd, "eventType", C.EVENT_TYPES) : null, schedule,
      nextRunAt: schedule ? nextScheduledRun(schedule) : null, conditions, steps: parseSteps(form.str(fd, "steps", { max: 50000 })),
      mode: form.oneOf(fd, "mode", C.AUTONOMY_MODES), maxRetries: form.int(fd, "maxRetries", 0, 10) ?? 2, enabled: form.bool(fd, "enabled"), updatedAt: new Date(),
    };
    if (id) return (await db.update(S.workflows).set(values).where(eq(S.workflows.id, id)).returning())[0];
    return (await db.insert(S.workflows).values(values).returning())[0];
  }, id ? `/automations/${id}` : "/automations/new");
  redirect(withFlash(`/automations/${row.id}`, "ok", "Workflow saved"));
}

export async function toggleWorkflow(id: string, enabled: boolean) {
  await requireAdmin();
  const [wf] = await db.select().from(S.workflows).where(eq(S.workflows.id, id));
  await db.update(S.workflows).set({ enabled, nextRunAt: wf?.schedule ? nextScheduledRun(wf.schedule) : null, updatedAt: new Date() }).where(eq(S.workflows.id, id));
  redirect(withFlash(`/automations/${id}`, "ok", enabled ? "Workflow enabled" : "Workflow disabled"));
}

export async function runWorkflowNow(id: string, fd: FormData) {
  await requireAdmin();
  const entityType = form.str(fd, "entityType"); const entityId = form.uuidOrNull(fd, "entityId");
  const r = await startWorkflowRun(id, { source: "manual", entityType, entityId });
  redirect(withFlash(`/automations/runs/${r.id}`, "ok", `Run ${r.status}`));
}

export async function retryWorkflowRun(runId: string) {
  await requireAdmin();
  await db.update(S.workflowRuns).set({ status: "running", nextAttemptAt: null }).where(eq(S.workflowRuns.id, runId));
  await executeRun(runId);
  redirect(withFlash(`/automations/runs/${runId}`, "ok", "Retried"));
}

export async function deleteWorkflow(id: string, fd: FormData) {
  await requireAdmin();
  if (!form.bool(fd, "confirm")) redirect(withFlash(`/automations/${id}`, "error", "Tick the confirmation box to delete"));
  await safeDelete(S.workflows, "workflows", id);
  redirect(withFlash("/automations", "ok", "Workflow deleted"));
}

export async function tickNow() {
  await requireAdmin();
  const r = await tick();
  redirect(withFlash("/automations", "ok", `Tick: ${r.events} event runs, ${r.scheduled} scheduled, ${r.retried} retries, ${r.overdueEvents} overdue events`));
}

/* ───────────── Notifications ───────────── */

export async function markAllRead() {
  await requireAdmin();
  await db.update(S.notifications).set({ readAt: new Date() }).where(sql`${S.notifications.readAt} is null`);
  redirect("/command?tab=notifications");
}

/* ───────────── Settings ───────────── */

export async function saveVenture(id: string | null, fd: FormData) {
  await requireAdmin();
  await guarded(async () => {
    const name = form.reqStr(fd, "name", 200);
    const values = {
      name, description: form.str(fd, "description"), services: form.str(fd, "services"), targetClients: form.str(fd, "targetClients"),
      acquisitionStrategy: form.str(fd, "acquisitionStrategy"), qualificationCriteria: form.str(fd, "qualificationCriteria"),
      agentInstructions: form.str(fd, "agentInstructions"), servicesConfirmed: form.bool(fd, "servicesConfirmed"), active: form.bool(fd, "active"), updatedAt: new Date(),
    };
    if (id) await db.update(S.ventures).set(values).where(eq(S.ventures.id, id));
    else {
      const [v] = await db.insert(S.ventures).values({ ...values, slug: slugify(name) }).returning();
      const stages = ["Identified", "Qualified", "Contacted", "Proposal / quotation", "Negotiation", "Won", "Lost"];
      await db.insert(S.pipelineStages).values(stages.map((s, i) => ({ ventureId: v.id, name: s, sortOrder: i, isClosed: i >= 5, isWon: s === "Won" })));
    }
  }, "/settings/ventures");
  redirect(withFlash("/settings/ventures", "ok", "Venture saved"));
}

export async function saveStages(ventureId: string, fd: FormData) {
  await requireAdmin();
  const names = (form.str(fd, "stages") ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!names.length) redirect(withFlash("/settings/ventures", "error", "Add at least one stage"));
  const existing = await db.select().from(S.pipelineStages).where(eq(S.pipelineStages.ventureId, ventureId));
  const keep = existing.filter((s) => names.includes(s.name));
  const drop = existing.filter((s) => !names.includes(s.name)).map((s) => s.id);
  if (drop.length) await db.delete(S.pipelineStages).where(inArray(S.pipelineStages.id, drop));
  for (const [i, n] of names.entries()) {
    const ex = keep.find((k) => k.name === n);
    const closed = /^(won|lost)$/i.test(n);
    if (ex) await db.update(S.pipelineStages).set({ sortOrder: i, isClosed: closed, isWon: /^won$/i.test(n) }).where(eq(S.pipelineStages.id, ex.id));
    else await db.insert(S.pipelineStages).values({ ventureId, name: n, sortOrder: i, isClosed: closed, isWon: /^won$/i.test(n) });
  }
  redirect(withFlash("/settings/ventures", "ok", "Pipeline stages saved"));
}

export async function saveScoringWeights(fd: FormData) {
  await requireAdmin();
  const factors = await db.select().from(S.scoringFactors);
  for (const f of factors) {
    const w = form.int(fd, `w_${f.key}`, 0, 10);
    const d = form.str(fd, `d_${f.key}`, { max: 500 });
    await db.update(S.scoringFactors).set({ weight: w ?? f.weight, description: d ?? f.description }).where(eq(S.scoringFactors.id, f.id));
  }
  redirect(withFlash("/settings/research", "ok", "Scoring methodology saved. Existing scores recompute on next save."));
}

export async function saveSectors(fd: FormData) {
  await requireAdmin();
  const enabled = new Set(form.uuids(fd, "researchEnabled"));
  const all = await db.select().from(S.sectors);
  for (const s of all) await db.update(S.sectors).set({ researchEnabled: enabled.has(s.id) }).where(eq(S.sectors.id, s.id));
  const newName = form.str(fd, "newSector", { max: 100 });
  if (newName) await db.insert(S.sectors).values({ name: newName, slug: slugify(newName), parentId: form.uuidOrNull(fd, "newSectorParent") }).onConflictDoNothing();
  redirect(withFlash("/settings/research", "ok", "Sectors saved"));
}

export async function changePassword(fd: FormData) {
  const user = await requireAdmin();
  const err = await authCore.changePassword(user.id, form.str(fd, "current") ?? "", form.str(fd, "next") ?? "");
  if (err) redirect(withFlash("/settings", "error", err));
  (await cookies()).delete(SESSION_COOKIE);
  redirect(withFlash("/login", "ok", "Password changed — please sign in again"));
}

export async function logoutEverywhere() {
  const user = await requireAdmin();
  await authCore.logoutAll(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function purgeDemoData(fd: FormData) {
  await requireAdmin();
  if (form.str(fd, "confirmText") !== "DELETE DEMO") redirect(withFlash("/settings/data", "error", "Type DELETE DEMO to confirm"));
  const { purgeDemo } = await import("./demo");
  const n = await purgeDemo();
  redirect(withFlash("/settings/data", "ok", `Removed ${n} demo records`));
}

export async function loadDemoData() {
  await requireAdmin();
  const { seedDemo } = await import("./demo");
  await seedDemo();
  redirect(withFlash("/settings/data", "ok", "Demo data loaded (clearly marked DEMO)"));
}


/* ───────────── Lusha decision-makers ───────────── */

export async function findDecisionMakersAction(projectId: string, fd: FormData) {
  await requireAdmin();
  const { findDecisionMakers } = await import("./lusha");
  const back = `/projects/${projectId}#decision-makers`;
  let msg: string; let ok = true;
  try {
    const r = await findDecisionMakers(projectId, { companyIds: form.uuids(fd, "companyId") });
    ok = r.added > 0 || (!r.errors.length && r.found > 0);
    msg = r.searched === 0 ? r.errors[0]
      : `Searched ${r.searched} compan${r.searched === 1 ? "y" : "ies"}: ${r.added} new decision-maker(s) found${r.found > r.added ? `, ${r.found - r.added} already listed` : ""}${r.credits ? ` · ${r.credits} Lusha credits used` : ""}${r.lowBalance ? " · Lusha balance is low" : ""}${r.errors.length ? ` · ${r.errors.length} issue(s): ${r.errors[0]}` : ""}`;
    if (!r.found && !r.errors.length) msg = `No people found in Lusha for the linked companies. Check the company names or add their websites (exact domains match best).`;
  } catch (e) { ok = false; msg = (e as Error).message; }
  redirect(withFlash(back, ok ? "ok" : "error", msg));
}

export async function revealContactsAction(projectId: string, fd: FormData) {
  await requireAdmin();
  const ids = form.uuids(fd, "candidateId");
  const back = `/projects/${projectId}#decision-makers`;
  if (!ids.length) redirect(withFlash(back, "error", "Tick at least one person to reveal"));
  const { dismissCandidates, revealCandidates } = await import("./lusha");
  if (fd.get("intent") === "dismiss") { await dismissCandidates(projectId, ids); redirect(withFlash(back, "ok", `${ids.length} removed from suggestions`)); }
  let msg: string; let ok = true;
  try {
    const r = await revealCandidates(projectId, ids);
    msg = `${r.revealed} contact(s) saved to the project · ${r.withPhone} with phone · ${r.withEmail} with email${r.credits ? ` · ${r.credits} Lusha credits used` : ""}${r.lowBalance ? " · Lusha balance is low" : ""}${r.errors.length ? ` · ${r.errors.length} not found` : ""}`;
    ok = r.revealed > 0;
  } catch (e) { ok = false; msg = (e as Error).message; }
  redirect(withFlash(back, ok ? "ok" : "error", msg));
}
