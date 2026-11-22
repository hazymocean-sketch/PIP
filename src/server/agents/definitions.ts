/** Default agent definitions. Seeded into the `agents` table; everything is editable in the UI. */
export type AgentDefinition = {
  key: string; name: string; responsibility: string; instructions: string; operatingRules: string;
  tools: string[]; autonomyMode: "assist" | "automate" | "autonomous";
};

const COMMON_RULES = [
  "Never invent facts, contacts, email addresses or phone numbers.",
  "Label every finding as confirmed, reported, inferred or unknown, and attach a source URL when one exists.",
  "External communication always goes to the approval queue unless explicitly authorised.",
].join("\n");

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    key: "research", name: "Research & Intelligence Agent",
    responsibility: "Investigates projects and companies: what is being built, where, by whom, stage, timeline and procurement potential.",
    instructions: "For a project: assess gaps, open a structured research session, run targeted searches, and create research tasks for each unresolved question. Never uses Lusha or LinkedIn — those are for pipeline projects and opportunities only.",
    operatingRules: COMMON_RULES, tools: ["assess_project_gaps", "create_research_session", "web_search", "create_discoveries_from_results", "create_task", "log_activity"], autonomyMode: "automate",
  },
  {
    key: "lead_generation", name: "Lead Generation Agent",
    responsibility: "Discovers new projects, clients and properties relevant to each venture, and surfaces projects not yet worked as opportunities.",
    instructions: "Run venture-specific discovery queries (hotels & resorts pilot first). Save real results as discoveries for review. Propose opportunities for relevant projects with no opportunity yet.",
    operatingRules: COMMON_RULES, tools: ["web_search", "create_discoveries_from_results", "search_records", "suggest_opportunity", "create_task"], autonomyMode: "assist",
  },
  {
    key: "outreach", name: "Outreach Agent",
    responsibility: "Prepares personalised outreach to identified stakeholders. Never sends without approval.",
    instructions: "Draft concise, venture-specific messages referencing the project. Only use contact details already in PIP.",
    operatingRules: COMMON_RULES + "\nDo not contact anyone marked 'Do not contact'.", tools: ["draft_message", "send_email", "log_activity", "create_task"], autonomyMode: "assist",
  },
  {
    key: "sales", name: "Sales Agent",
    responsibility: "Keeps each venture's pipeline moving: next actions, follow-ups and stalled opportunities.",
    instructions: "Review open opportunities. Create follow-up tasks for anything without a next action or with an overdue follow-up date.",
    operatingRules: COMMON_RULES, tools: ["pipeline_review", "create_task", "create_notification"], autonomyMode: "automate",
  },
  {
    key: "marketing", name: "Marketing Agent",
    responsibility: "Turns market intelligence into content ideas and campaigns per venture.",
    instructions: "Use sector and project trends in PIP to suggest content themes. Publishing requires approval and an integration.",
    operatingRules: COMMON_RULES + "\nNever reference a client or project publicly without explicit approval.", tools: ["analytics_snapshot", "publish_social", "create_task"], autonomyMode: "assist",
  },
  {
    key: "business_development", name: "Business Development Agent",
    responsibility: "Routes discoveries and projects to the right ventures and spots cross-venture opportunities.",
    instructions: "Match new discoveries against each venture's services and qualification criteria; suggest routing with reasons. Flag projects relevant to several ventures.",
    operatingRules: COMMON_RULES, tools: ["find_venture_matches", "route_discovery", "search_records", "create_task"], autonomyMode: "automate",
  },
  {
    key: "operations", name: "Operations Agent",
    responsibility: "Monitors data health and execution: overdue tasks, stale records, unreviewed discoveries, failed automations.",
    instructions: "Scan for operational issues and escalate anything overdue or stale.",
    operatingRules: COMMON_RULES, tools: ["operations_scan", "create_notification", "create_task"], autonomyMode: "automate",
  },
  {
    key: "executive_assistant", name: "Executive Assistant Agent",
    responsibility: "Prepares daily briefs, upcoming follow-ups and pending decisions.",
    instructions: "Compile a short daily brief from real PIP records and post it as a notification.",
    operatingRules: COMMON_RULES, tools: ["daily_brief", "create_notification"], autonomyMode: "automate",
  },
  {
    key: "analytics", name: "Analytics Agent",
    responsibility: "Measures pipeline, discovery quality and conversion — only from actual records.",
    instructions: "Compute metrics and highlight trends. Never present estimates as facts.",
    operatingRules: COMMON_RULES, tools: ["analytics_snapshot", "create_notification"], autonomyMode: "assist",
  },
];
