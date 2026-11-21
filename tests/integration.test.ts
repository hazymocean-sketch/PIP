import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { authCore } from "@/server/auth-core";
import { createRecord, deleteRecord, parseFields, updateRecord } from "@/server/entities";
import { PROJECT_FIELDS } from "@/lib/fields";
import { findDuplicateProjects, saveDiscoveryAsProject, runDiscovery } from "@/server/research";
import { decideApproval, routeCommand, startAgentRun } from "@/server/agents/runner";
import { startWorkflowRun, tick, executeRun } from "@/server/workflows/engine";
import { seedDemo, purgeDemo } from "@/server/demo";

const venture = async (slug: string) => (await db.select().from(S.ventures).where(eq(S.ventures.slug, slug)))[0];

describe("authentication", () => {
  it("rejects weak admin passwords", async () => {
    await expect(authCore.upsertAdmin("admin@pip.test", "short")).rejects.toThrow();
  });
  it("logs in, validates and revokes sessions", async () => {
    await authCore.upsertAdmin("admin@pip.test", "CorrectHorse123");
    const bad = await authCore.login("admin@pip.test", "wrong", null);
    expect("error" in bad).toBe(true);
    const ok = await authCore.login("admin@pip.test", "CorrectHorse123", "vitest");
    expect("token" in ok).toBe(true);
    const token = (ok as { token: string }).token;
    const u = await authCore.validateSession(token);
    expect(u?.email).toBe("admin@pip.test");
    expect(await authCore.validateSession(token + "x")).toBeNull();
    const [stored] = await db.select().from(S.sessions);
    expect(stored.tokenHash).not.toContain(token); // only a keyed hash is stored
    await authCore.logout(token);
    expect(await authCore.validateSession(token)).toBeNull();
  });
  it("locks the account after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) await authCore.login("admin@pip.test", "nope", null);
    const r = await authCore.login("admin@pip.test", "CorrectHorse123", null);
    expect("error" in r && r.error).toMatch(/locked/);
    await authCore.upsertAdmin("admin@pip.test", "CorrectHorse123"); // reset clears lock
    expect("token" in (await authCore.login("admin@pip.test", "CorrectHorse123", null))).toBe(true);
  });
});

describe("CRUD and relationships", () => {
  it("validates input", () => {
    const fd = new FormData();
    expect(() => parseFields(fd, PROJECT_FIELDS)).toThrow(/required/);
    fd.set("name", "X"); fd.set("estimatedValue", "abc");
    expect(() => parseFields(fd, PROJECT_FIELDS)).toThrow(/number/);
    fd.set("estimatedValue", "1,200,000"); fd.set("status", "bogus");
    expect(() => parseFields(fd, PROJECT_FIELDS)).toThrow(/invalid/);
  });

  it("creates linked projects, companies, contacts and opportunities; deletes safely", async () => {
    const dev = await createRecord("companies", { name: "Test Developer Co", category: "developer" });
    const p = await createRecord("projects", { name: "Test Grand Resort", city: "Dubai", roomsUnits: 200 });
    expect(p.status).toBe("new");
    expect(p.developmentStage).toBe("unknown");
    await db.insert(S.projectCompanies).values({ projectId: p.id, companyId: dev.id, role: "developer" });
    const calibro = await venture("calibro"), moog = await venture("moog");
    await db.insert(S.projectVentures).values([{ projectId: p.id, ventureId: calibro.id, relevance: "FF&E" }, { projectId: p.id, ventureId: moog.id, relevance: "Lobby finishes" }]);
    const c = await createRecord("contacts", { fullName: "Test Person", companyId: dev.id });
    const o1 = await createRecord("opportunities", { title: "FF&E", projectId: p.id, ventureId: calibro.id });
    const o2 = await createRecord("opportunities", { title: "Finishes", projectId: p.id, ventureId: moog.id });
    await db.insert(S.opportunityContacts).values({ opportunityId: o1.id, contactId: c.id });
    const opps = await db.select().from(S.opportunities).where(eq(S.opportunities.projectId, p.id));
    expect(opps).toHaveLength(2);
    const pv = await db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, p.id));
    expect(pv).toHaveLength(2);

    const up = await updateRecord("projects", p.id, { name: "Test Grand Resort", status: "verified" });
    expect(up.status).toBe("verified");
    const ev = await db.select().from(S.events).where(and(eq(S.events.type, "project.status_changed"), eq(S.events.entityId, p.id)));
    expect(ev).toHaveLength(1);

    await deleteRecord("projects", p.id);
    const [after] = await db.select().from(S.opportunities).where(eq(S.opportunities.id, o2.id));
    expect(after.projectId).toBeNull(); // opportunity survives, link cleared
    const [audit] = await db.select().from(S.auditLog).where(eq(S.auditLog.entityId, p.id));
    expect((audit.snapshot as any).name).toBe("Test Grand Resort");
    expect(await db.select().from(S.projectVentures).where(eq(S.projectVentures.projectId, p.id))).toHaveLength(0);
  });

  it("blocks duplicate news by URL", async () => {
    await createRecord("news", { title: "Hotel X announced", url: "https://www.example.com/a?utm_source=t" });
    await expect(createRecord("news", { title: "Different title", url: "https://example.com/a/" })).rejects.toThrow(/already exists/);
  });
});

describe("discovery workflow", () => {
  it("detects duplicate projects and promotes a discovery with its source", async () => {
    await createRecord("projects", { name: "Azure Palm Resort Ras Al Khaimah" });
    const dups = await findDuplicateProjects("Azure Palm Resort");
    expect(dups[0]?.name).toBe("Azure Palm Resort Ras Al Khaimah");

    const d = await createRecord("discoveries", { title: "New Saffron resort on Al Marjan", url: "https://example.com/disc", location: "Ras Al Khaimah", developerName: "Nobody Known" });
    const calibro = await venture("calibro");
    const p = await saveDiscoveryAsProject(d.id, { name: "Saffron Al Marjan Resort", ventureIds: [calibro.id] });
    const [src] = await db.select().from(S.sources).where(eq(S.sources.projectId, p.id));
    expect(src.url).toBe("https://example.com/disc");
    expect(src.infoStatus).toBe("reported");
    const [dd] = await db.select().from(S.discoveries).where(eq(S.discoveries.id, d.id));
    expect(dd.status).toBe("saved");
    expect(dd.projectId).toBe(p.id);
  });

  it("runs in manual mode with no search provider and creates no fake results", async () => {
    const r = await runDiscovery({ title: "t", query: null, sectorId: null, location: "Dubai", dateFrom: null, dateTo: null, template: "hotels" });
    expect(r.provider).toBeNull();
    expect(r.created).toBe(0);
    expect(r.session.query).toContain("new hotel announced Dubai");
  });
});

describe("agents", () => {
  it("research agent: real internal actions, simulated web search", async () => {
    const p = await createRecord("projects", { name: "Agent Test Hotel" });
    const r = await startAgentRun({ agentKey: "research", instruction: "research", targetType: "project", targetId: p.id });
    expect(r.status).toBe("completed");
    const [run] = await db.select().from(S.agentRuns).where(eq(S.agentRuns.id, r.runId));
    expect(run.isSimulated).toBe(true);
    const steps = await db.select().from(S.agentRunSteps).where(eq(S.agentRunSteps.runId, r.runId));
    expect(steps.find((s) => s.tool === "web_search" && s.kind === "tool_result")?.message).toMatch(/SIMULATED/);
    const t = await db.select().from(S.tasks).where(eq(S.tasks.projectId, p.id));
    expect(t.length).toBeGreaterThan(0); // automate mode: internal tasks created
    expect(await db.select().from(S.discoveries).where(eq(S.discoveries.agentRunId, r.runId))).toHaveLength(0);
  });

  it("outreach: requires approval; approved send is simulated; never invents addresses", async () => {
    const c = await createRecord("contacts", { fullName: "Mail Person", email: "mail@example.com" });
    const noMail = await createRecord("contacts", { fullName: "No Mail" });
    const r = await startAgentRun({ agentKey: "outreach", instruction: "intro", targetType: "contact", targetId: c.id });
    expect(r.status).toBe("awaiting_approval");
    const [a] = await db.select().from(S.approvals).where(eq(S.approvals.agentRunId, r.runId));
    expect(a.tool).toBe("send_email");
    expect(a.isSimulated).toBe(true);
    const done = await decideApproval(a.id, "approved");
    expect((done.executionResult as any).simulated).toBe(true);
    const [run] = await db.select().from(S.agentRuns).where(eq(S.agentRuns.id, r.runId));
    expect(run.status).toBe("completed");

    const r2 = await startAgentRun({ agentKey: "outreach", instruction: "intro", targetType: "contact", targetId: noMail.id });
    expect(r2.status).toBe("completed");
    expect(r2.summary).toMatch(/no email address/i);
  });

  it("assist mode gates internal changes; disallowed tools are blocked", async () => {
    await db.update(S.agents).set({ autonomyMode: "assist" }).where(eq(S.agents.key, "sales"));
    const o = await createRecord("opportunities", { title: "Stalled deal", followUpDate: "2020-01-01" });
    const r = await startAgentRun({ agentKey: "sales", instruction: "review" });
    expect(r.status).toBe("awaiting_approval");
    expect(await db.select().from(S.tasks).where(eq(S.tasks.opportunityId, o.id))).toHaveLength(0);
    const pend = await db.select().from(S.approvals).where(eq(S.approvals.agentRunId, r.runId));
    await decideApproval(pend[0].id, "approved");
    expect((await db.select().from(S.tasks).where(eq(S.tasks.opportunityId, o.id))).length).toBe(1);
    await db.update(S.agents).set({ autonomyMode: "automate", tools: ["pipeline_review"] }).where(eq(S.agents.key, "sales"));
    const r2 = await startAgentRun({ agentKey: "sales", instruction: "review" });
    const blocked = await db.select().from(S.agentRunSteps).where(and(eq(S.agentRunSteps.runId, r2.runId), eq(S.agentRunSteps.kind, "blocked")));
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("routes natural-language commands", async () => {
    expect((await routeCommand("give me today's brief")).agentKey).toBe("executive_assistant");
    expect((await routeCommand("research agent test hotel")).project?.name).toBe("Agent Test Hotel");
  });
});

describe("workflow engine", () => {
  it("event trigger → condition → task + notification", async () => {
    await db.insert(S.workflows).values({ name: "wf-event", triggerType: "event", eventType: "project.created", enabled: true, mode: "automate",
      conditions: [{ field: "city", op: "eq", value: "Abu Dhabi" }],
      steps: [{ type: "create_task", config: { title: "Kickoff {{entity.name}}", dueInDays: 1 } }, { type: "notify", config: { title: "New: {{entity.name}}" } }] });
    const p = await createRecord("projects", { name: "AD Event Hotel", city: "Abu Dhabi" });
    const t = await db.select().from(S.tasks).where(eq(S.tasks.projectId, p.id));
    expect(t[0]?.title).toBe("Kickoff AD Event Hotel");
    const skipped = await createRecord("projects", { name: "Dubai Event Hotel", city: "Dubai" });
    expect(await db.select().from(S.tasks).where(eq(S.tasks.projectId, skipped.id))).toHaveLength(0);
    await db.update(S.workflows).set({ enabled: false }).where(eq(S.workflows.name, "wf-event"));
  });

  it("pauses for approval and resumes; rejection cancels", async () => {
    const [wf] = await db.insert(S.workflows).values({ name: "wf-approve", triggerType: "manual", enabled: true, mode: "automate",
      steps: [{ type: "request_approval", config: { title: "ok?" } }, { type: "notify", config: { title: "after approval" } }] }).returning();
    const run = await startWorkflowRun(wf.id, { source: "test" });
    expect(run.status).toBe("awaiting_approval");
    const [a] = await db.select().from(S.approvals).where(eq(S.approvals.workflowRunId, run.id));
    await decideApproval(a.id, "approved");
    const [r] = await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.id, run.id));
    expect(r.status).toBe("completed");
    const run2 = await startWorkflowRun(wf.id, { source: "test" });
    const [a2] = await db.select().from(S.approvals).where(eq(S.approvals.workflowRunId, run2.id));
    await decideApproval(a2.id, "rejected");
    expect((await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.id, run2.id)))[0].status).toBe("cancelled");
  });

  it("retries failures with backoff, then fails and escalates", async () => {
    const [wf] = await db.insert(S.workflows).values({ name: "wf-fail", triggerType: "manual", enabled: true, maxRetries: 1,
      steps: [{ type: "run_agent", config: { agentKey: "does_not_exist" } }] }).returning();
    const run = await startWorkflowRun(wf.id, { source: "test" });
    expect(run.status).toBe("retrying");
    await db.update(S.workflowRuns).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(S.workflowRuns.id, run.id));
    await tick();
    const [r] = await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.id, run.id));
    expect(r.status).toBe("failed");
    expect(r.attempt).toBe(2);
    const n = await db.select().from(S.notifications).where(eq(S.notifications.title, "Workflow failed: wf-fail"));
    expect(n).toHaveLength(1);
    expect(executeRun).toBeTypeOf("function");
  });

  it("schedules: first tick arms, due tick runs", async () => {
    const [wf] = await db.insert(S.workflows).values({ name: "wf-sched", triggerType: "schedule", schedule: { every: "hour" }, enabled: true, mode: "automate",
      steps: [{ type: "notify", config: { title: "scheduled ping" } }] }).returning();
    await tick();
    const [armed] = await db.select().from(S.workflows).where(eq(S.workflows.id, wf.id));
    expect(armed.nextRunAt).not.toBeNull();
    await tick(new Date(Date.now() + 2 * 3600_000));
    expect(await db.select().from(S.workflowRuns).where(eq(S.workflowRuns.workflowId, wf.id))).toHaveLength(1);
    await db.update(S.workflows).set({ enabled: false }).where(eq(S.workflows.id, wf.id));
  });
});

describe("demo data isolation", () => {
  it("seeds clearly marked demo data and purges it completely", async () => {
    await seedDemo();
    const demoProjects = await db.select().from(S.projects).where(eq(S.projects.isDemo, true));
    expect(demoProjects.length).toBe(3);
    expect(demoProjects.every((p) => p.name.startsWith("[DEMO]"))).toBe(true);
    const runs = await db.select().from(S.agentRuns).where(eq(S.agentRuns.isDemo, true));
    expect(runs.length).toBeGreaterThan(3);
    await purgeDemo();
    const left = await db.execute(sql`select (select count(*) from projects where is_demo)::int + (select count(*) from agent_runs where is_demo)::int + (select count(*) from companies where is_demo)::int as n`);
    expect((left.rows[0] as any).n).toBe(0);
    expect((await db.select().from(S.projects).where(eq(S.projects.name, "Agent Test Hotel"))).length).toBe(1); // real data untouched
  });
});
