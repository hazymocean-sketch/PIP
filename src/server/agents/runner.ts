/**
 * Agent runtime.
 *
 * Each run executes a playbook (rule-based planner) that calls tools through a
 * single gateway: `api.call()`. The gateway enforces the agent's tool allow-list
 * and the approval policy, logs every step, and records whether anything was
 * simulated. When an AI provider is configured, it is used only for the run
 * summary today; the gateway is the same interface an LLM tool-use loop will use.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentRunSteps, agentRuns, agents, approvals, discoveries, projects, ventures } from "@/db/schema";
import { getAIProvider, getSearchProvider } from "@/server/ai/providers";
import { notify } from "@/server/core";
import { TOOLS, unworkedProjectsForVenture, type ToolResult } from "./tools";
import { requiresApproval, riskFor, type Mode } from "./policy";

type Agent = typeof agents.$inferSelect;
type RunInput = {
  agentKey?: string; agentId?: string; instruction: string; ventureId?: string | null;
  targetType?: string | null; targetId?: string | null; triggeredBy?: "user" | "workflow" | "schedule" | "command";
  workflowRunId?: string | null; modeOverride?: Mode | null;
};

export type CallOutcome = (ToolResult & { pendingApproval?: false }) | { pendingApproval: true; approvalId: string; ok: true; message: string };

class RunApi {
  seq = 0; externalActions = 0; simulated = false; pending = 0; notes: string[] = [];
  constructor(public run: typeof agentRuns.$inferSelect, public agent: Agent, public mode: Mode) {}

  async log(kind: string, message: string, extra: Partial<typeof agentRunSteps.$inferInsert> = {}) {
    await db.insert(agentRunSteps).values({ runId: this.run.id, seq: ++this.seq, kind, message, ...extra });
  }

  async call(toolKey: string, input: Record<string, any>, why: string, approvalTitle?: string): Promise<CallOutcome> {
    const tool = TOOLS[toolKey];
    if (!tool) throw new Error(`Unknown tool ${toolKey}`);
    if (!this.agent.tools.includes(toolKey)) {
      await this.log("blocked", `Tool “${tool.label}” is not permitted for this agent.`, { tool: toolKey, input });
      return { ok: false, message: "Tool not permitted" };
    }
    await this.log("plan", why, { tool: toolKey, input });
    if (requiresApproval(tool, this.mode, this.externalActions, this.agent.autonomyLimit)) {
      const willSimulate = tool.kind === "external" && !(tool.integration === "search" && getSearchProvider());
      const [a] = await db.insert(approvals).values({
        kind: tool.kind === "external" ? "external_action" : "internal_change", title: approvalTitle ?? `${tool.label}: ${why}`.slice(0, 300),
        description: why, tool: toolKey, payload: input, riskLevel: riskFor(tool), agentId: this.agent.id, agentRunId: this.run.id,
        workflowRunId: this.run.workflowRunId, ventureId: this.run.ventureId, isSimulated: willSimulate,
      }).returning();
      this.pending++;
      await this.log("approval_requested", `Waiting for approval (${this.mode} mode).`, { tool: toolKey, input, output: { approvalId: a.id } });
      return { pendingApproval: true, approvalId: a.id, ok: true, message: "Approval requested" };
    }
    const res = await tool.run({ runId: this.run.id, agentId: this.agent.id, ventureId: this.run.ventureId }, input);
    if (tool.kind === "external" && tool.consequential) this.externalActions++;
    if (res.simulated) this.simulated = true;
    await this.log(res.ok ? "tool_result" : "tool_error", res.message, { tool: toolKey, output: res.data as object, isSimulated: !!res.simulated });
    return res;
  }
}

/* ───────────── Playbooks (rule-based planner) ───────────── */

type Playbook = (api: RunApi, run: typeof agentRuns.$inferSelect) => Promise<string>;

async function ventureName(id: string | null) {
  if (!id) return null;
  const [v] = await db.select().from(ventures).where(eq(ventures.id, id));
  return v ?? null;
}

const PLAYBOOKS: Record<string, Playbook> = {
  async research(api, run) {
    if (run.targetType !== "project" || !run.targetId) {
      const q = run.instruction;
      const r = await api.call("web_search", { query: q }, `Search the web for: ${q}`);
      if ("data" in r && (r.data as any)?.results?.length) await api.call("create_discoveries_from_results", { results: (r.data as any).results }, "Save results for review");
      return r.message;
    }
    const [p] = await db.select().from(projects).where(eq(projects.id, run.targetId));
    if (!p) return "Target project not found.";
    const gaps = await api.call("assess_project_gaps", { projectId: p.id }, `Check what is still unknown about ${p.name}`);
    const gapList: string[] = ("data" in gaps && (gaps.data as any)?.gaps) || [];
    const session = await api.call("create_research_session", {
      title: `Research: ${p.name}`, kind: "project", projectId: p.id,
      checklist: ["What is being developed?", "Where exactly is it located?", "Who is the developer / owner?", "Who is the operator / brand?",
        "Who is designing or consulting?", "What stage is it at?", "When was it announced?", "What is the expected timeline?", "What procurement or supply opportunities may exist?"],
    }, "Open a structured research record for the findings");
    const sessionId = "data" in session ? (session.data as any)?.sessionId : undefined;
    const query = `"${p.name}" ${p.city ?? "UAE"} ${gapList.includes("Main contractor") ? "contractor" : ""} ${gapList.includes("Interior designer") ? "interior design" : ""}`.trim();
    const s = await api.call("web_search", { query }, `Search for public updates on ${p.name}`);
    const results = ("data" in s && (s.data as any)?.results) || [];
    if (results.length) await api.call("create_discoveries_from_results", { results, sessionId }, "Save search results as discoveries to verify");
    for (const g of gapList.slice(0, 4)) {
      await api.call("create_task", { title: `Research ${g.toLowerCase()} — ${p.name}`, projectId: p.id, dueInDays: 3, priority: "medium" }, `Open question: ${g}`);
    }
    return `${gapList.length} research gaps on ${p.name}. ${results.length ? `${results.length} search results saved for review.` : "Web search not connected — research checklist and tasks prepared for manual work."}`;
  },

  async lead_generation(api, run) {
    const v = await ventureName(run.ventureId);
    const query = run.instruction || `new hotel resort development announced UAE ${new Date().getFullYear()}`;
    const s = await api.call("web_search", { query }, `Discovery search${v ? ` for ${v.name}` : ""}: ${query}`);
    const results = ("data" in s && (s.data as any)?.results) || [];
    if (results.length) await api.call("create_discoveries_from_results", { results }, "Save results as discoveries for review");
    let proposed = 0;
    if (v) {
      const unworked = await unworkedProjectsForVenture(v.id);
      for (const p of unworked.slice(0, 3)) {
        const r = await api.call("suggest_opportunity", { projectId: p.id, ventureId: v.id, title: `${p.name} — ${v.name}`, scope: p.relevance ?? undefined },
          `${p.name} is linked to ${v.name} but has no opportunity yet`, `Create opportunity: ${p.name} — ${v.name}`);
        if (r.ok) proposed++;
      }
    }
    return `${results.length ? `${results.length} new results saved.` : "No live search (not connected)."} ${proposed ? `${proposed} opportunity proposal(s) raised.` : v ? "No unworked projects for this venture." : "Select a venture to propose opportunities."}`;
  },

  async outreach(api, run) {
    const input: Record<string, string> = { purpose: run.instruction };
    if (run.targetType === "contact" && run.targetId) input.contactId = run.targetId;
    if (run.targetType === "opportunity" && run.targetId) {
      input.opportunityId = run.targetId;
      const c = await db.execute(sql`select contact_id from opportunity_contacts where opportunity_id = ${run.targetId} limit 1`);
      if (c.rows[0]) input.contactId = (c.rows[0] as any).contact_id;
    }
    const d = await api.call("draft_message", input, "Prepare a draft message");
    const draft = "data" in d ? (d.data as any) : null;
    if (!draft) return "Could not prepare draft.";
    if (!draft.hasAddress) return `Draft prepared but no email address is on file${draft.toName ? ` for ${draft.toName}` : ""}. Not sending; add a verified address first.`;
    await api.call("send_email", { to: draft.to, subject: draft.subject, body: draft.body }, `Send outreach to ${draft.toName}`, `Send email to ${draft.toName}: “${draft.subject}”`);
    return `Draft for ${draft.toName} is in the approval queue.`;
  },

  async sales(api) {
    const r = await api.call("pipeline_review", {}, "Review open opportunities");
    const data = ("data" in r && (r.data as any)) || { noAction: [], overdue: [] };
    for (const o of data.overdue.slice(0, 5)) await api.call("create_task", { title: `Follow up: ${o.title}`, opportunityId: o.id, dueInDays: 1, priority: "high" }, `Follow-up date ${o.followUpDate} has passed`);
    for (const o of data.noAction.slice(0, 5)) await api.call("create_task", { title: `Define next action: ${o.title}`, opportunityId: o.id, dueInDays: 2 }, "Opportunity has no next action");
    return r.message;
  },

  async marketing(api, run) {
    const v = await ventureName(run.ventureId);
    const a = await api.call("analytics_snapshot", {}, "Look at current pipeline and discovery data");
    const theme = `${v?.name ?? "Studio"} perspective on ${run.instruction || "UAE hospitality pipeline trends"}`;
    await api.call("publish_social", { channel: "LinkedIn", text: `Draft theme: ${theme}` }, `Publish post: ${theme}`, `Publish LinkedIn post (${v?.name ?? "venture"})`);
    return `Content theme proposed: “${theme}”. ${a.message}`;
  },

  async business_development(api, run) {
    const pending = await db.select().from(discoveries).where(and(eq(discoveries.status, "new"), sql`${discoveries.suggestedVentureIds} is null`)).limit(10);
    let routed = 0;
    for (const d of pending) {
      const m = await api.call("find_venture_matches", { text: `${d.title} ${d.summary ?? ""}` }, `Match “${d.title}” to ventures`);
      const matches = ("data" in m && (m.data as any)?.matches) || [];
      if (matches.length) {
        await api.call("route_discovery", { discoveryId: d.id, ventureIds: matches.map((x: any) => x.ventureId), notes: m.message }, `Suggest ventures for “${d.title}”`);
        routed++;
      }
    }
    const multi = await db.execute(sql`select p.name, count(*)::int as n from project_ventures pv join projects p on p.id = pv.project_id group by p.name having count(*) > 1 order by n desc limit 5`);
    const cross = (multi.rows as { name: string; n: number }[]).map((r) => `${r.name} (${r.n} ventures)`);
    if (cross.length) await api.log("insight", `Cross-venture projects: ${cross.join(", ")}`);
    return `${pending.length} unrouted discoveries reviewed, ${routed} routed by keyword match.${cross.length ? ` Cross-venture: ${cross.join(", ")}.` : ""}${run.instruction ? "" : ""}`;
  },

  async operations(api) {
    const r = await api.call("operations_scan", {}, "Scan for overdue, stale and unreviewed work");
    const d = ("data" in r && (r.data as any)) || { overdue: [] };
    if (d.overdue.length) await api.call("create_notification", { title: `${d.overdue.length} overdue task(s)`, body: d.overdue.slice(0, 5).map((t: any) => `• ${t.title} (due ${t.dueDate})`).join("\n"), level: "warning", link: "/tasks?view=overdue" }, "Escalate overdue tasks");
    return r.message;
  },

  async executive_assistant(api) {
    const r = await api.call("daily_brief", {}, "Compile today's brief");
    const d = ("data" in r && (r.data as any)) || {};
    const body = [
      ...(d.due ?? []).slice(0, 6).map((t: any) => `• Task: ${t.title}${t.dueDate ? ` (${t.dueDate})` : ""}`),
      ...(d.followUps ?? []).slice(0, 6).map((o: any) => `• Follow-up: ${o.title} (${o.date})`),
      `• Approvals pending: ${d.pendingApprovals ?? 0}`,
    ].join("\n");
    await api.call("create_notification", { title: `Daily brief — ${d.date}`, body, level: "info", link: "/command" }, "Post the brief");
    return r.message;
  },

  async analytics(api) {
    const r = await api.call("analytics_snapshot", {}, "Compute metrics from records");
    return r.message;
  },
};

/* ───────────── Run lifecycle ───────────── */

export async function startAgentRun(input: RunInput) {
  const [agent] = input.agentId
    ? await db.select().from(agents).where(eq(agents.id, input.agentId))
    : await db.select().from(agents).where(eq(agents.key, input.agentKey ?? ""));
  if (!agent) throw new Error("Agent not found");
  if (!agent.enabled) throw new Error(`${agent.name} is disabled`);
  const mode = (input.modeOverride ?? agent.autonomyMode) as Mode;
  const ai = getAIProvider();
  const [run] = await db.insert(agentRuns).values({
    agentId: agent.id, ventureId: input.ventureId ?? null, instruction: input.instruction || "(no instruction)",
    targetType: input.targetType ?? null, targetId: input.targetId ?? null, mode, planner: ai ? "rules+ai" : "rules",
    status: "running", triggeredBy: input.triggeredBy ?? "user", workflowRunId: input.workflowRunId ?? null, startedAt: new Date(),
  }).returning();

  const api = new RunApi(run, agent, mode);
  const playbook = PLAYBOOKS[agent.key];
  try {
    await api.log("start", `${agent.name} started in ${mode} mode${ai ? "" : " · rule-based planner (no AI model connected)"}.`);
    if (!playbook) throw new Error(`No playbook for agent ${agent.key}`);
    let summary = await playbook(api, run);
    if (ai) {
      try {
        const steps = await db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, run.id));
        summary = await ai.complete(
          `You summarise an agent run for a business owner. Use only the facts in the log. Mark anything simulated as SIMULATED. Rules:\n${agent.operatingRules ?? ""}`,
          `Agent: ${agent.name}\nInstruction: ${run.instruction}\nLog:\n${steps.map((s) => `- [${s.kind}] ${s.message}`).join("\n")}\nRule-based summary: ${summary}`,
          { maxTokens: 400 });
      } catch (e) { await api.log("warning", `AI summary failed: ${(e as Error).message}. Kept rule-based summary.`); }
    }
    const status = api.pending > 0 ? "awaiting_approval" : "completed";
    await db.update(agentRuns).set({ status, summary, isSimulated: api.simulated, finishedAt: status === "completed" ? new Date() : null }).where(eq(agentRuns.id, run.id));
    await api.log("finish", summary);
    if (api.pending > 0) await notify(`${agent.name}: ${api.pending} action(s) need approval`, summary, "warning", "/command?tab=approvals");
    return { runId: run.id, status, summary };
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(agentRuns).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(agentRuns.id, run.id));
    await api.log("error", msg);
    return { runId: run.id, status: "failed", summary: msg };
  }
}

/** Approve or reject an approval request. Approved actions execute through the same tool registry. */
export async function decideApproval(approvalId: string, decision: "approved" | "rejected", note?: string | null) {
  const [a] = await db.select().from(approvals).where(eq(approvals.id, approvalId));
  if (!a) throw new Error("Approval not found");
  if (a.status !== "pending") return a;
  let result: ToolResult | null = null;
  if (decision === "approved" && a.tool && TOOLS[a.tool]) {
    try {
      result = await TOOLS[a.tool].run({ runId: a.agentRunId ?? "", agentId: a.agentId ?? "", ventureId: a.ventureId }, (a.payload ?? {}) as Record<string, any>);
    } catch (e) { result = { ok: false, message: (e as Error).message }; }
  }
  const [updated] = await db.update(approvals).set({
    status: decision, decisionNote: note ?? null, decidedAt: new Date(), executionResult: result as object | null,
    isSimulated: a.isSimulated || !!result?.simulated,
  }).where(eq(approvals.id, approvalId)).returning();

  if (a.agentRunId) {
    const seq = await db.execute(sql`select coalesce(max(seq),0)::int as s from agent_run_steps where run_id = ${a.agentRunId}`);
    await db.insert(agentRunSteps).values({ runId: a.agentRunId, seq: (seq.rows[0] as any).s + 1, kind: decision === "approved" ? "approved" : "rejected",
      tool: a.tool, message: decision === "approved" ? `Approved → ${result?.message ?? "executed"}` : `Rejected${note ? `: ${note}` : ""}`, output: result?.data as object, isSimulated: !!result?.simulated });
    const left = await db.execute(sql`select count(*)::int as n from approvals where agent_run_id = ${a.agentRunId} and status = 'pending'`);
    if ((left.rows[0] as any).n === 0) {
      await db.update(agentRuns).set({ status: "completed", finishedAt: new Date(), isSimulated: sql`${agentRuns.isSimulated} or ${!!result?.simulated}` }).where(eq(agentRuns.id, a.agentRunId));
    }
  }
  if (a.workflowRunId) {
    const { resumeAfterApproval } = await import("@/server/workflows/engine");
    await resumeAfterApproval(a.workflowRunId, decision);
  }
  return updated;
}

/** Simple intent routing for the Command Centre when no AI model is connected. */
export async function routeCommand(text: string) {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(brief|today|agenda|schedule)\b/, "executive_assistant"],
    [/\b(email|outreach|draft|message|contact)\b/, "outreach"],
    [/\b(pipeline|follow[- ]?up|stalled|sales)\b/, "sales"],
    [/\b(route|routing|which venture|cross[- ]venture)\b/, "business_development"],
    [/\b(overdue|stale|health|operations)\b/, "operations"],
    [/\b(metric|analytics|conversion|win rate|stats)\b/, "analytics"],
    [/\b(post|content|marketing|linkedin|instagram)\b/, "marketing"],
    [/\b(find|discover|leads?|new projects?)\b/, "lead_generation"],
    [/\b(research|investigate|who is|status of|tender|procurement)\b/, "research"],
  ];
  const agentKey = rules.find(([re]) => re.test(t))?.[1] ?? "research";
  // Try to resolve a project mention via trigram similarity
  const m = await db.execute(sql`select id, name, similarity(normalized_name, ${t}) as s from projects
    where ${t} ilike '%' || normalized_name || '%' or similarity(normalized_name, ${t}) > 0.25 order by s desc limit 1`);
  const project = m.rows[0] as { id: string; name: string } | undefined;
  const ven = await db.select().from(ventures);
  const venture = ven.find((v) => t.includes(v.name.toLowerCase()) || t.includes(v.slug));
  return { agentKey, project: project ?? null, ventureId: venture?.id ?? null };
}

