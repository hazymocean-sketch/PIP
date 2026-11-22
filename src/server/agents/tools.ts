/**
 * Agent tool registry.
 *
 * kind "internal": operates on PIP's own database — real actions.
 * kind "external": needs an outside integration. If the integration is not
 *   connected, the tool returns a SIMULATED result that says exactly what would
 *   have happened, and writes nothing that looks like real research.
 *
 * consequential: changes data or reaches the outside world → subject to the
 *   approval policy (see policy.ts).
 */
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities, companies, contacts, discoveries, opportunities, projects,
  researchSessions, tasks, ventures,
} from "@/db/schema";
import { getSearchProvider } from "@/server/ai/providers";
import { addDays, notify, today } from "@/server/core";
import { normalizeName, normalizeUrl } from "@/lib/normalize";

export type ToolContext = { runId: string; agentId: string; ventureId: string | null };
export type ToolResult = { ok: boolean; simulated?: boolean; data?: unknown; message: string };

export type ToolDef = {
  key: string;
  label: string;
  description: string;
  kind: "internal" | "external";
  consequential: boolean;
  integration?: "search" | "email" | "social" | "calendar";
  run: (ctx: ToolContext, input: Record<string, any>) => Promise<ToolResult>;
};

const PROJECT_FIELDS: [keyof typeof projects.$inferSelect, string][] = [
  ["city", "Location"], ["developmentStage", "Development stage"], ["procurementStage", "Procurement stage"],
  ["expectedCompletion", "Expected completion"], ["announcementDate", "Announcement date"], ["roomsUnits", "Rooms / units"],
  ["estimatedValue", "Estimated value"], ["brand", "Operator / brand"], ["description", "Description"],
];

export const TOOLS: Record<string, ToolDef> = {
  search_records: {
    key: "search_records", label: "Search PIP records", kind: "internal", consequential: false,
    description: "Search projects, companies and contacts in PIP's database.",
    async run(_ctx, { query }) {
      const q = `%${String(query ?? "").slice(0, 100)}%`;
      const [p, c, k] = await Promise.all([
        db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(ilike(projects.name, q)).limit(10),
        db.select({ id: companies.id, name: companies.name, category: companies.category }).from(companies).where(ilike(companies.name, q)).limit(10),
        db.select({ id: contacts.id, name: contacts.fullName, position: contacts.position }).from(contacts).where(ilike(contacts.fullName, q)).limit(10),
      ]);
      return { ok: true, data: { projects: p, companies: c, contacts: k }, message: `Found ${p.length} projects, ${c.length} companies, ${k.length} contacts matching “${query}”.` };
    },
  },

  assess_project_gaps: {
    key: "assess_project_gaps", label: "Assess research gaps", kind: "internal", consequential: false,
    description: "List which key project facts are still unknown or unverified.",
    async run(_ctx, { projectId }) {
      const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!p) return { ok: false, message: "Project not found" };
      const gaps = PROJECT_FIELDS.filter(([f]) => {
        const v = p[f];
        return v === null || v === undefined || v === "" || v === "unknown";
      }).map(([, l]) => l);
      const linked = await db.execute(sql`select role from project_companies where project_id = ${projectId}`);
      const roles = new Set((linked.rows as { role: string }[]).map((r) => r.role));
      for (const [role, l] of [["developer", "Developer"], ["operator", "Operator"], ["interior_designer", "Interior designer"], ["main_contractor", "Main contractor"]] as const) {
        if (!roles.has(role)) gaps.push(l);
      }
      const src = await db.execute(sql`select count(*)::int as n from sources where project_id = ${projectId}`);
      const sourceCount = (src.rows[0] as { n: number }).n;
      return { ok: true, data: { gaps, sourceCount, verification: p.verificationStatus, project: { id: p.id, name: p.name, city: p.city } },
        message: gaps.length ? `${gaps.length} gaps: ${gaps.join(", ")}. ${sourceCount} source(s) on file.` : `No major gaps. ${sourceCount} source(s) on file.` };
    },
  },

  web_search: {
    key: "web_search", label: "Web / news search", kind: "external", consequential: false, integration: "search",
    description: "Search the public web and news for a query.",
    async run(_ctx, { query, maxResults }) {
      const provider = getSearchProvider();
      if (!provider) {
        return { ok: true, simulated: true, data: { query, results: [] },
          message: `SIMULATED — no search provider connected. Would have searched: “${query}”. No results were fabricated.` };
      }
      const results = await provider.search(String(query), { maxResults: maxResults ?? 8 });
      return { ok: true, data: { query, results }, message: `${provider.label}: ${results.length} results for “${query}”.` };
    },
  },

  create_discoveries_from_results: {
    key: "create_discoveries_from_results", label: "Save search results as discoveries", kind: "internal", consequential: false,
    description: "Store real search results as discoveries for human review (skips duplicates).",
    async run(ctx, { results, sessionId }) {
      const list = (results ?? []) as { title: string; url: string; snippet?: string; publishedAt?: string; sourceName?: string }[];
      let created = 0, skipped = 0;
      for (const r of list) {
        const nu = normalizeUrl(r.url);
        const existing = nu ? await db.select({ id: discoveries.id }).from(discoveries).where(eq(discoveries.normalizedUrl, nu)).limit(1) : [];
        if (existing.length) { skipped++; continue; }
        await db.insert(discoveries).values({
          title: r.title, normalizedTitle: normalizeName(r.title), summary: r.snippet ?? null, url: r.url, normalizedUrl: nu,
          sourceName: r.sourceName ?? null, publishedAt: r.publishedAt?.slice(0, 10) ?? null, researchSessionId: sessionId ?? null,
          infoStatus: "reported", aiGenerated: false, agentRunId: ctx.runId,
        });
        created++;
      }
      return { ok: true, data: { created, skipped }, message: `Saved ${created} discoveries for review, skipped ${skipped} duplicates.` };
    },
  },

  create_research_session: {
    key: "create_research_session", label: "Open research session", kind: "internal", consequential: false,
    description: "Create a structured research session with a checklist linked to a record.",
    async run(ctx, { title, kind, projectId, companyId, checklist, query }) {
      const [s] = await db.insert(researchSessions).values({
        title, kind: kind ?? "project", projectId: projectId ?? null, companyId: companyId ?? null, query: query ?? null,
        checklist: (checklist ?? []).map((q: string) => ({ q })), agentRunId: ctx.runId, provider: getSearchProvider()?.id ?? "manual",
      }).returning();
      return { ok: true, data: { sessionId: s.id }, message: `Opened research session “${title}”.` };
    },
  },

  create_task: {
    key: "create_task", label: "Create task", kind: "internal", consequential: true,
    description: "Create a follow-up task linked to a record.",
    async run(ctx, { title, description, dueInDays, priority, projectId, opportunityId, companyId, contactId }) {
      const [t] = await db.insert(tasks).values({
        title: String(title).slice(0, 300), description: description ?? null, priority: priority ?? "medium",
        dueDate: dueInDays != null ? addDays(Number(dueInDays)) : null, projectId: projectId ?? null, opportunityId: opportunityId ?? null,
        companyId: companyId ?? null, contactId: contactId ?? null, createdByAgentId: ctx.agentId,
      }).returning();
      return { ok: true, data: { taskId: t.id }, message: `Created task “${t.title}”${t.dueDate ? ` due ${t.dueDate}` : ""}.` };
    },
  },

  log_activity: {
    key: "log_activity", label: "Log activity", kind: "internal", consequential: true,
    description: "Record a research activity or project update.",
    async run(_ctx, { subject, notes, type, projectId, opportunityId }) {
      const [a] = await db.insert(activities).values({ subject, notes, type: type ?? "research", projectId: projectId ?? null, opportunityId: opportunityId ?? null }).returning();
      return { ok: true, data: { activityId: a.id }, message: `Logged activity “${subject}”.` };
    },
  },

  find_venture_matches: {
    key: "find_venture_matches", label: "Match ventures", kind: "internal", consequential: false,
    description: "Score which ventures a project or discovery is relevant to, using each venture's configured services and criteria.",
    async run(_ctx, { text }) {
      const vs = await db.select().from(ventures).where(eq(ventures.active, true));
      const words = new Set(normalizeName(String(text ?? "")).split(" ").filter((w) => w.length > 3));
      const matches = vs.map((v) => {
        const vocab = normalizeName(`${v.services ?? ""} ${v.targetClients ?? ""} ${v.qualificationCriteria ?? ""}`).split(" ").filter((w) => w.length > 3);
        const hits = [...new Set(vocab.filter((w) => words.has(w)))];
        return { ventureId: v.id, venture: v.name, hits, score: hits.length, servicesConfirmed: v.servicesConfirmed };
      }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
      return { ok: true, data: { matches }, message: matches.length ? `Keyword match: ${matches.map((m) => `${m.venture} (${m.hits.slice(0, 4).join(", ")})`).join("; ")}. This is a rule-based inference, not a verified fit.` : "No venture keyword matches — needs human routing." };
    },
  },

  route_discovery: {
    key: "route_discovery", label: "Route discovery to ventures", kind: "internal", consequential: true,
    description: "Attach suggested ventures to a discovery for review.",
    async run(_ctx, { discoveryId, ventureIds, notes }) {
      await db.update(discoveries).set({ suggestedVentureIds: ventureIds, routingNotes: notes ?? null, updatedAt: new Date() }).where(eq(discoveries.id, discoveryId));
      return { ok: true, message: `Suggested ${ventureIds.length} venture(s) on discovery.` };
    },
  },

  pipeline_review: {
    key: "pipeline_review", label: "Review pipeline", kind: "internal", consequential: false,
    description: "Find open opportunities with no next action or an overdue follow-up.",
    async run(ctx) {
      const conds = [or(eq(opportunities.commercialStatus, "open"), eq(opportunities.commercialStatus, "proposal"), eq(opportunities.commercialStatus, "negotiation"))];
      if (ctx.ventureId) conds.push(eq(opportunities.ventureId, ctx.ventureId));
      const open = await db.select().from(opportunities).where(and(...conds)).limit(200);
      const t = today();
      const noAction = open.filter((o) => !o.nextAction);
      const overdue = open.filter((o) => o.followUpDate && o.followUpDate < t);
      return { ok: true, data: { open: open.length, noAction: noAction.map((o) => ({ id: o.id, title: o.title })), overdue: overdue.map((o) => ({ id: o.id, title: o.title, followUpDate: o.followUpDate })) },
        message: `${open.length} open opportunities · ${noAction.length} without a next action · ${overdue.length} with overdue follow-up.` };
    },
  },

  operations_scan: {
    key: "operations_scan", label: "Operations health scan", kind: "internal", consequential: false,
    description: "Find overdue tasks, stale projects and unreviewed discoveries.",
    async run() {
      const t = today();
      const overdue = await db.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority }).from(tasks)
        .where(and(lt(tasks.dueDate, t), or(eq(tasks.status, "open"), eq(tasks.status, "in_progress")))).limit(50);
      const stale = await db.select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt }).from(projects)
        .where(and(lt(projects.updatedAt, new Date(Date.now() - 30 * 86400000)), sql`${projects.status} not in ('won','lost','cancelled')`)).limit(50);
      const unreviewed = await db.select({ id: discoveries.id }).from(discoveries).where(eq(discoveries.status, "new"));
      return { ok: true, data: { overdue, stale, unreviewed: unreviewed.length },
        message: `${overdue.length} overdue tasks · ${stale.length} projects not updated in 30 days · ${unreviewed.length} discoveries awaiting review.` };
    },
  },

  daily_brief: {
    key: "daily_brief", label: "Compile daily brief", kind: "internal", consequential: false,
    description: "Summarise today's follow-ups, approvals and recent activity.",
    async run() {
      const t = today(), week = addDays(7);
      const due = await db.select({ title: tasks.title, dueDate: tasks.dueDate }).from(tasks)
        .where(and(sql`${tasks.dueDate} <= ${week}`, or(eq(tasks.status, "open"), eq(tasks.status, "in_progress")))).orderBy(tasks.dueDate).limit(15);
      const followUps = await db.select({ title: opportunities.title, date: opportunities.followUpDate }).from(opportunities)
        .where(sql`${opportunities.followUpDate} <= ${week} and ${opportunities.commercialStatus} in ('open','proposal','negotiation')`).limit(15);
      const pending = await db.execute(sql`select count(*)::int as n from approvals where status = 'pending'`);
      const recent = await db.select({ subject: activities.subject, at: activities.occurredAt }).from(activities).orderBy(desc(activities.occurredAt)).limit(5);
      return { ok: true, data: { due, followUps, pendingApprovals: (pending.rows[0] as { n: number }).n, recent, date: t },
        message: `${due.length} tasks due within 7 days, ${followUps.length} opportunity follow-ups, ${(pending.rows[0] as { n: number }).n} approvals pending.` };
    },
  },

  analytics_snapshot: {
    key: "analytics_snapshot", label: "Analytics snapshot", kind: "internal", consequential: false,
    description: "Compute pipeline and discovery metrics from real records.",
    async run() {
      const r = await db.execute(sql`select
        (select count(*) from projects)::int as projects,
        (select count(*) from projects where status in ('verified','qualified','active_opportunity','won'))::int as verified_plus,
        (select count(*) from discoveries)::int as discoveries,
        (select count(*) from discoveries where status = 'saved')::int as discoveries_saved,
        (select count(*) from discoveries where status = 'rejected')::int as discoveries_rejected,
        (select count(*) from opportunities)::int as opportunities,
        (select count(*) from opportunities where commercial_status = 'won')::int as won,
        (select count(*) from opportunities where commercial_status = 'lost')::int as lost`);
      const m = r.rows[0] as Record<string, number>;
      const reviewed = m.discoveries_saved + m.discoveries_rejected;
      const closed = m.won + m.lost;
      return { ok: true, data: { ...m, discoveryAcceptRate: reviewed ? Math.round((m.discoveries_saved / reviewed) * 100) : null, winRate: closed ? Math.round((m.won / closed) * 100) : null },
        message: `${m.projects} projects (${m.verified_plus} verified+), ${m.discoveries} discoveries, ${m.opportunities} opportunities, win rate ${closed ? Math.round((m.won / closed) * 100) + "%" : "n/a (no closed deals)"}.` };
    },
  },

  draft_message: {
    key: "draft_message", label: "Draft outreach message", kind: "internal", consequential: false,
    description: "Prepare an outreach draft from a template. Drafts are never sent without approval.",
    async run(_ctx, { contactId, opportunityId, purpose }) {
      const [c] = contactId ? await db.select().from(contacts).where(eq(contacts.id, contactId)) : [];
      const [o] = opportunityId ? await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)) : [];
      const [v] = o?.ventureId ? await db.select().from(ventures).where(eq(ventures.id, o.ventureId)) : [];
      const [p] = o?.projectId ? await db.select().from(projects).where(eq(projects.id, o.projectId)) : [];
      const first = c?.fullName?.replace(/^\[DEMO\]\s*/, "").split(" ")[0] || "there";
      const subject = p ? `${p.name} — ${v?.name ?? "introduction"}` : `Introduction — ${v?.name ?? "PIP"}`;
      const body = [
        `Hi ${first},`, "",
        p ? `I understand ${p.name} is progressing${p.developmentStage && p.developmentStage !== "unknown" ? ` (${p.developmentStage.replace(/_/g, " ")})` : ""}.` : "I wanted to introduce our studio.",
        v?.services ? `${v.name} works on ${v.services.split(/[.;\n]/)[0].toLowerCase()}.` : "",
        "Would you be open to a short call to see whether we could support the project?", "",
        "Best regards,", v ? `${v.name} team` : "",
      ].filter((l) => l !== "").join("\n");
      return { ok: true, data: { to: c?.email ?? null, toName: c?.fullName ?? null, subject, body, purpose: purpose ?? null, hasAddress: !!c?.email },
        message: `Draft prepared${c ? ` for ${c.fullName}` : ""}${c && !c.email ? " (no email on file — will not invent one)" : ""}.` };
    },
  },

  send_email: {
    key: "send_email", label: "Send email", kind: "external", consequential: true, integration: "email",
    description: "Send an email. Always requires approval unless explicitly authorised.",
    async run(_ctx, { to, subject }) {
      return { ok: true, simulated: true, data: { to, subject }, message: `SIMULATED — email integration not connected. Nothing was sent to ${to ?? "(no address)"}.` };
    },
  },

  publish_social: {
    key: "publish_social", label: "Publish social post", kind: "external", consequential: true, integration: "social",
    description: "Publish a post to LinkedIn / Instagram.",
    async run(_ctx, { channel }) {
      return { ok: true, simulated: true, message: `SIMULATED — ${channel ?? "social"} integration not connected. Nothing was published.` };
    },
  },

  create_notification: {
    key: "create_notification", label: "Notify", kind: "internal", consequential: false,
    description: "Post a notification in PIP.",
    async run(_ctx, { title, body, level, link }) {
      await notify(title, body, level ?? "info", link);
      return { ok: true, message: `Notification posted: ${title}` };
    },
  },

  suggest_opportunity: {
    key: "suggest_opportunity", label: "Create opportunity", kind: "internal", consequential: true,
    description: "Create an opportunity record for a project/venture pair.",
    async run(_ctx, { projectId, ventureId, title, scope }) {
      const [o] = await db.insert(opportunities).values({ projectId, ventureId, title, scope: scope ?? null, qualificationStatus: "qualifying", notes: "Created by agent — review before acting." }).returning();
      return { ok: true, data: { opportunityId: o.id }, message: `Created opportunity “${title}”.` };
    },
  },
};

export function toolList() {
  return Object.values(TOOLS).map(({ run, ...rest }) => rest);
}

/** Projects linked to a venture but without an opportunity for it. Used by lead-gen. */
export async function unworkedProjectsForVenture(ventureId: string) {
  const r = await db.execute(sql`
    select p.id, p.name, p.status, pv.relevance from projects p
    join project_ventures pv on pv.project_id = p.id and pv.venture_id = ${ventureId}
    where p.status not in ('lost','cancelled','won')
      and not exists (select 1 from opportunities o where o.project_id = p.id and o.venture_id = ${ventureId})
    order by p.opportunity_score desc nulls last limit 10`);
  return r.rows as { id: string; name: string; status: string; relevance: string | null }[];
}

