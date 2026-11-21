/**
 * PIP database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 *  - uuid primary keys, created_at / updated_at timestamps on every table.
 *  - Status-like columns are text validated in the app layer (see src/lib/constants.ts)
 *    so new values can be added without a migration.
 *  - `is_demo` marks clearly-labelled demo/sample records. Demo data is never mixed
 *    with genuine research and can be purged from Settings.
 *  - `is_simulated` marks agent/workflow output produced without a real integration.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, boolean, integer, numeric, date, jsonb,
  primaryKey, index, uniqueIndex, type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────────────────── Users & auth ───────────────────────── */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default("Administrator"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

/* ───────────────────────── Configuration ───────────────────────── */

export const ventures = pgTable("ventures", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  services: text("services"),
  targetClients: text("target_clients"),
  acquisitionStrategy: text("acquisition_strategy"),
  qualificationCriteria: text("qualification_criteria"),
  agentInstructions: text("agent_instructions"),
  servicesConfirmed: boolean("services_confirmed").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Per-venture commercial pipeline stages. */
export const pipelineStages = pgTable("pipeline_stages", {
  id: id(),
  ventureId: uuid("venture_id").notNull().references(() => ventures.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isClosed: boolean("is_closed").notNull().default(false),
  isWon: boolean("is_won").notNull().default(false),
  createdAt: createdAt(),
});

export const sectors = pgTable("sectors", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: uuid("parent_id").references((): AnyPgColumn => sectors.id, { onDelete: "cascade" }),
  researchEnabled: boolean("research_enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const scoringFactors = pgTable("scoring_factors", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  weight: integer("weight").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/* ───────────────────────── Core intelligence ───────────────────────── */

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  category: text("category").notNull().default("other"),
  location: text("location"),
  country: text("country"),
  website: text("website"),
  description: text("description"),
  notes: text("notes"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("companies_norm_idx").on(t.normalizedName)]);

export const contacts = pgTable("contacts", {
  id: id(),
  fullName: text("full_name").notNull(),
  position: text("position"),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  email: text("email"),
  phone: text("phone"),
  profileUrl: text("profile_url"),
  relationshipStatus: text("relationship_status").notNull().default("not_contacted"),
  notes: text("notes"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  contactSource: text("contact_source"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  projectType: text("project_type"),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  subSectorId: uuid("sub_sector_id").references(() => sectors.id, { onDelete: "set null" }),
  country: text("country").default("UAE"),
  city: text("city"),
  address: text("address"),
  brand: text("brand"),
  description: text("description"),
  status: text("status").notNull().default("new"),
  developmentStage: text("development_stage").notNull().default("unknown"),
  procurementStage: text("procurement_stage").notNull().default("unknown"),
  procurementPackages: text("procurement_packages"),
  estimatedValue: numeric("estimated_value", { precision: 16, scale: 2 }),
  valueCurrency: text("value_currency").default("AED"),
  valueBasis: text("value_basis").notNull().default("unknown"),
  size: text("size"),
  roomsUnits: integer("rooms_units"),
  announcementDate: date("announcement_date"),
  expectedCompletion: text("expected_completion"),
  opportunityScore: integer("opportunity_score"),
  scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>(),
  scoreNotes: text("score_notes"),
  researchNotes: text("research_notes"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("projects_norm_idx").on(t.normalizedName), index("projects_status_idx").on(t.status)]);

/** Companies attached to a project with a role (developer, operator, architect…). */
export const projectCompanies = pgTable("project_companies", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.projectId, t.companyId, t.role] })]);

/** One project can be relevant to several ventures, each with its own reason. */
export const projectVentures = pgTable("project_ventures", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  ventureId: uuid("venture_id").notNull().references(() => ventures.id, { onDelete: "cascade" }),
  relevance: text("relevance"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.projectId, t.ventureId] })]);

export const projectContacts = pgTable("project_contacts", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  role: text("role"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.projectId, t.contactId] })]);

export const opportunities = pgTable("opportunities", {
  id: id(),
  title: text("title").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  ventureId: uuid("venture_id").references(() => ventures.id, { onDelete: "set null" }),
  stageId: uuid("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
  opportunityType: text("opportunity_type"),
  scope: text("scope"),
  estimatedValue: numeric("estimated_value", { precision: 16, scale: 2 }),
  valueCurrency: text("value_currency").default("AED"),
  qualificationStatus: text("qualification_status").notNull().default("unqualified"),
  priority: text("priority").notNull().default("medium"),
  decisionMakers: text("decision_makers"),
  nextAction: text("next_action"),
  followUpDate: date("follow_up_date"),
  commercialStatus: text("commercial_status").notNull().default("open"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const opportunityContacts = pgTable("opportunity_contacts", {
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.opportunityId, t.contactId] })]);

/* ───────────────────────── Research ───────────────────────── */

export const researchSessions = pgTable("research_sessions", {
  id: id(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  query: text("query"),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  location: text("location"),
  dateFrom: date("date_from"),
  dateTo: date("date_to"),
  provider: text("provider").notNull().default("manual"),
  status: text("status").notNull().default("open"),
  report: text("report"),
  checklist: jsonb("checklist").$type<{ q: string; answer?: string; basis?: string }[]>(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  agentRunId: uuid("agent_run_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const discoveries = pgTable("discoveries", {
  id: id(),
  researchSessionId: uuid("research_session_id").references(() => researchSessions.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  normalizedTitle: text("normalized_title").notNull(),
  kind: text("kind").notNull().default("project"),
  summary: text("summary"),
  url: text("url"),
  normalizedUrl: text("normalized_url"),
  sourceName: text("source_name"),
  publishedAt: date("published_at"),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  location: text("location"),
  developerName: text("developer_name"),
  operatorName: text("operator_name"),
  status: text("status").notNull().default("new"),
  infoStatus: text("info_status").notNull().default("reported"),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  duplicateOfProjectId: uuid("duplicate_of_project_id").references(() => projects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  suggestedVentureIds: jsonb("suggested_venture_ids").$type<string[]>(),
  routingNotes: text("routing_notes"),
  agentRunId: uuid("agent_run_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  isSimulated: boolean("is_simulated").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("discoveries_url_idx").on(t.normalizedUrl), index("discoveries_status_idx").on(t.status)]);

export const newsItems = pgTable("news_items", {
  id: id(),
  title: text("title").notNull(),
  normalizedTitle: text("normalized_title").notNull(),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  sourceName: text("source_name"),
  publishedAt: date("published_at"),
  summary: text("summary"),
  category: text("category").notNull().default("development"),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  location: text("location"),
  developerId: uuid("developer_id").references(() => companies.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  relevance: integer("relevance").notNull().default(3),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("news_url_uq").on(t.normalizedUrl)]);

/** Evidence: every important claim traces back to a source row. */
export const sources = pgTable("sources", {
  id: id(),
  url: text("url"),
  normalizedUrl: text("normalized_url"),
  sourceName: text("source_name"),
  title: text("title"),
  publishedAt: date("published_at"),
  accessedAt: date("accessed_at").notNull().default(sql`current_date`),
  extractedInfo: text("extracted_info"),
  supportsField: text("supports_field"),
  infoStatus: text("info_status").notNull().default("reported"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  discoveryId: uuid("discovery_id").references(() => discoveries.id, { onDelete: "cascade" }),
  researchSessionId: uuid("research_session_id").references(() => researchSessions.id, { onDelete: "cascade" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/* ───────────────────────── Activities & tasks ───────────────────────── */

export const activities = pgTable("activities", {
  id: id(),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  outcome: text("outcome"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tasks = pgTable("tasks", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  createdByAgentId: uuid("created_by_agent_id"),
  workflowRunId: uuid("workflow_run_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────── Agents ───────────────────────── */

export const agents = pgTable("agents", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  responsibility: text("responsibility").notNull(),
  instructions: text("instructions"),
  operatingRules: text("operating_rules"),
  tools: jsonb("tools").$type<string[]>().notNull().default([]),
  autonomyMode: text("autonomy_mode").notNull().default("assist"),
  /** Max consequential actions per run allowed without approval in autonomous mode. */
  autonomyLimit: integer("autonomy_limit").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  modelProvider: text("model_provider"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Ventures an agent works for. No rows = all ventures. */
export const agentVentures = pgTable("agent_ventures", {
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  ventureId: uuid("venture_id").notNull().references(() => ventures.id, { onDelete: "cascade" }),
  instructions: text("instructions"),
}, (t) => [primaryKey({ columns: [t.agentId, t.ventureId] })]);

export const agentRuns = pgTable("agent_runs", {
  id: id(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  ventureId: uuid("venture_id").references(() => ventures.id, { onDelete: "set null" }),
  instruction: text("instruction").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  mode: text("mode").notNull(),
  planner: text("planner").notNull().default("rules"),
  status: text("status").notNull().default("queued"),
  summary: text("summary"),
  output: jsonb("output"),
  error: text("error"),
  triggeredBy: text("triggered_by").notNull().default("user"),
  workflowRunId: uuid("workflow_run_id"),
  isSimulated: boolean("is_simulated").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("agent_runs_agent_idx").on(t.agentId)]);

export const agentRunSteps = pgTable("agent_run_steps", {
  id: id(),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(),
  tool: text("tool"),
  input: jsonb("input"),
  output: jsonb("output"),
  message: text("message"),
  isSimulated: boolean("is_simulated").notNull().default(false),
  createdAt: createdAt(),
});

/* ───────────────────────── Approvals ───────────────────────── */

export const approvals = pgTable("approvals", {
  id: id(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  tool: text("tool"),
  payload: jsonb("payload"),
  riskLevel: text("risk_level").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  workflowRunId: uuid("workflow_run_id"),
  ventureId: uuid("venture_id").references(() => ventures.id, { onDelete: "set null" }),
  decisionNote: text("decision_note"),
  executionResult: jsonb("execution_result"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  isSimulated: boolean("is_simulated").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("approvals_status_idx").on(t.status)]);

/* ───────────────────────── Workflows ───────────────────────── */

export type WorkflowStep = {
  type: "condition" | "create_task" | "notify" | "escalate" | "request_approval" | "run_agent" | "update_field" | "schedule_follow_up";
  label?: string;
  config: Record<string, unknown>;
};

export const workflows = pgTable("workflows", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  ventureId: uuid("venture_id").references(() => ventures.id, { onDelete: "set null" }),
  triggerType: text("trigger_type").notNull(),
  eventType: text("event_type"),
  schedule: jsonb("schedule").$type<{ every: "hour" | "day" | "week"; at?: string; weekday?: number }>(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  conditions: jsonb("conditions").$type<{ field: string; op: string; value: unknown }[]>().notNull().default([]),
  steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
  mode: text("mode").notNull().default("assist"),
  maxRetries: integer("max_retries").notNull().default(2),
  enabled: boolean("enabled").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: id(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  trigger: jsonb("trigger"),
  context: jsonb("context"),
  currentStep: integer("current_step").notNull().default(0),
  attempt: integer("attempt").notNull().default(1),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  error: text("error"),
  isSimulated: boolean("is_simulated").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("workflow_runs_wf_idx").on(t.workflowId)]);

export const workflowRunLogs = pgTable("workflow_run_logs", {
  id: id(),
  runId: uuid("run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index"),
  stepType: text("step_type"),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  attempt: integer("attempt").notNull().default(1),
  createdAt: createdAt(),
});

/** Event outbox: services emit events; the engine matches them to event-triggered workflows. */
export const events = pgTable("events", {
  id: id(),
  type: text("type").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("events_unprocessed_idx").on(t.processedAt)]);

export const notifications = pgTable("notifications", {
  id: id(),
  title: text("title").notNull(),
  body: text("body"),
  level: text("level").notNull().default("info"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/** Command Centre conversation log. */
export const commandMessages = pgTable("command_messages", {
  id: id(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/** Audit trail incl. JSON snapshot of deleted records (recovery safeguard). */
export const auditLog = pgTable("audit_log", {
  id: id(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  summary: text("summary"),
  snapshot: jsonb("snapshot"),
  createdAt: createdAt(),
});
