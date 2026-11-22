/** Idempotent base configuration seed: ventures, pipelines, sectors, scoring, agents, workflow templates. No business data. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, pipelineStages, scoringFactors, sectors, ventures, workflows } from "@/db/schema";
import { AGENT_DEFINITIONS } from "./agents/definitions";

export const VENTURE_SEED = [
  { slug: "calibro", name: "Calibro", servicesConfirmed: true,
    description: "Furniture, FF&E and related commercial supply.",
    services: "Furniture supply; FF&E procurement and supply for hotels, resorts, offices and residential; loose furniture; hospitality FF&E packages; seating, casegoods, lighting.",
    targetClients: "Hotel owners and developers, operators' procurement teams, interior designers, fit-out and main contractors, procurement companies.",
    acquisitionStrategy: "Identify hotel/resort projects before FF&E specification. Build relationships with interior designers and procurement agents who specify FF&E. Track tenders.",
    qualificationCriteria: "Hospitality or commercial project with an FF&E package; stage between design development and fit-out; reachable specifier or procurement lead; UAE or GCC.",
    agentInstructions: "Prioritise projects approaching FF&E specification or tender. Note rooms/keys count — it drives FF&E scope." },
  { slug: "ffd", name: "FFD (Furniture Focused Design)", servicesConfirmed: true,
    description: "Design-led residential and commercial interior projects.",
    services: "Interior design; furniture-focused design; residential interiors; villa and penthouse interiors; commercial interiors; styling and furniture curation.",
    targetClients: "Private owners, villa and penthouse buyers, residential developers, branded residences, boutique commercial clients.",
    acquisitionStrategy: "Track luxury residential and branded residence handovers; partner with developers and real-estate agents; referrals from designers.",
    qualificationCriteria: "Residential or boutique commercial; owner or developer still choosing interiors; premium budget.",
    agentInstructions: "Branded residences attached to hotels are relevant. Handover dates matter more than construction start." },
  { slug: "m-studio", name: "M Studio", servicesConfirmed: true,
    description: "Commercial interior branding and experiential design.",
    services: "Interior branding; experiential design; brand environments; retail and F&B concepts; signage and wayfinding concepts; activations.",
    targetClients: "Brands, F&B and retail operators, hotel operators launching outlets, mall operators, corporate offices.",
    acquisitionStrategy: "Monitor new F&B, retail and hotel outlet launches; brand entries into UAE; mall openings.",
    qualificationCriteria: "Brand-led space with experiential or identity component; launch within 3–12 months.",
    agentInstructions: "Look for hotel F&B outlets, lobbies and brand launches — not structural works." },
  { slug: "moog", name: "MOOG", servicesConfirmed: true,
    description: "Architectural finishes, resin, special surfaces, bespoke furniture and art installations.",
    services: "Special finishes; architectural finishes; resin surfaces; microcement and feature walls; special surfaces; bespoke furniture; art installations; feature lobbies.",
    targetClients: "Interior designers, architects, fit-out contractors, developers of luxury hotels, villas, mosques and feature spaces.",
    acquisitionStrategy: "Get specified early through designers and architects; sample-led approach; showcase feature-surface projects.",
    qualificationCriteria: "Project with feature/statement surfaces (lobbies, spas, F&B, villas); designer reachable; stage before finishes are locked.",
    agentInstructions: "Lobbies, spas, F&B outlets and feature walls are prime. Engage at design development." },
  { slug: "neoform", name: "Neoform", servicesConfirmed: false, description: "Services to be confirmed.", services: null, targetClients: null, acquisitionStrategy: null, qualificationCriteria: null, agentInstructions: "Services not yet confirmed — do not route automatically." },
  { slug: "lava-gray", name: "Lava Gray", servicesConfirmed: false, description: "Services to be confirmed.", services: null, targetClients: null, acquisitionStrategy: null, qualificationCriteria: null, agentInstructions: "Services not yet confirmed — do not route automatically." },
];

const DEFAULT_STAGES = [["Identified", false, false], ["Qualified", false, false], ["Contacted", false, false], ["Meeting / brief", false, false],
  ["Proposal / quotation", false, false], ["Negotiation", false, false], ["Won", true, true], ["Lost", true, false]] as const;

const SECTOR_SEED: { slug: string; name: string; research: boolean; children?: [string, string][] }[] = [
  { slug: "hotels-resorts", name: "Hotels & resorts", research: true, children: [["hotel", "Hotel"], ["resort", "Resort"], ["branded-residences", "Branded residences"], ["hotel-refurbishment", "Refurbishment / expansion"], ["serviced-apartments", "Serviced apartments"]] },
  { slug: "residential", name: "Residential developments", research: false, children: [["villas", "Villas"], ["apartments", "Apartments"], ["penthouses", "Penthouses"]] },
  { slug: "fnb-retail-leisure", name: "F&B, retail & leisure", research: false, children: [["fnb", "F&B"], ["retail", "Retail"], ["leisure", "Leisure / entertainment"]] },
  { slug: "education-institutional", name: "Education & institutional", research: false },
  { slug: "office-commercial", name: "Office & commercial", research: false },
  { slug: "other", name: "Other", research: false },
];

export const SCORING_SEED = [
  ["sector_relevance", "Sector relevance", 3, "How well the sector fits the venture(s)."],
  ["project_size", "Project size", 2, "Keys, units or area relative to typical deals."],
  ["development_stage", "Development stage", 3, "Closer to design development / procurement scores higher."],
  ["procurement_scope", "Procurement scope", 3, "Size and fit of likely packages (FF&E, finishes, branding…)."],
  ["timing", "Timing", 2, "Procurement window within the next 3–18 months."],
  ["stakeholder_access", "Stakeholder accessibility", 2, "Do we know or can we reach the decision-makers?"],
  ["evidence_quality", "Evidence quality", 2, "Confirmed by credible sources vs rumour."],
  ["commercial_fit", "Commercial fit", 3, "Margin, payment risk, brand value."],
] as const;

const SCHEDULED_TEMPLATES = [
  { name: "Daily discovery — hotels & resorts (UAE)", description: "Every morning: runs the 8 hotels & resorts searches across the UAE, saves new finds for review (duplicates skipped), then suggests ventures for them.",
    triggerType: "schedule", schedule: { every: "day" as const, at: "06:30" }, mode: "automate", enabled: true,
    steps: [{ type: "run_discovery" as const, config: { location: "UAE", template: "hotels" } },
            { type: "run_agent" as const, config: { agentKey: "business_development", instruction: "Route new discoveries" } }] },
  { name: "Weekly discovery — Ras Al Khaimah & Abu Dhabi", description: "Every Monday morning: deeper hotels & resorts searches for two priority emirates.",
    triggerType: "schedule", schedule: { every: "week" as const, weekday: 1, at: "06:30" }, mode: "automate", enabled: true,
    steps: [{ type: "run_discovery" as const, config: { location: "Ras Al Khaimah", template: "hotels" } },
            { type: "run_discovery" as const, config: { location: "Abu Dhabi", template: "hotels" } },
            { type: "run_agent" as const, config: { agentKey: "business_development", instruction: "Route new discoveries" } }] },
];

export async function seedBase() {
  for (const [i, v] of VENTURE_SEED.entries()) {
    const [existing] = await db.select().from(ventures).where(eq(ventures.slug, v.slug));
    const id = existing?.id ?? (await db.insert(ventures).values({ ...v, sortOrder: i }).returning())[0].id;
    const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.ventureId, id));
    if (!stages.length) {
      await db.insert(pipelineStages).values(DEFAULT_STAGES.map(([name, isClosed, isWon], j) => ({ ventureId: id, name, isClosed, isWon, sortOrder: j })));
    }
  }
  for (const [i, s] of SECTOR_SEED.entries()) {
    let [parent] = await db.select().from(sectors).where(eq(sectors.slug, s.slug));
    if (!parent) [parent] = await db.insert(sectors).values({ slug: s.slug, name: s.name, researchEnabled: s.research, sortOrder: i }).returning();
    for (const [j, [slug, name]] of (s.children ?? []).entries()) {
      const [c] = await db.select().from(sectors).where(eq(sectors.slug, slug));
      if (!c) await db.insert(sectors).values({ slug, name, parentId: parent.id, sortOrder: j });
    }
  }
  for (const [i, [key, lbl, weight, description]] of SCORING_SEED.entries()) {
    await db.insert(scoringFactors).values({ key, label: lbl, weight, description, sortOrder: i }).onConflictDoNothing();
  }
  for (const [i, a] of AGENT_DEFINITIONS.entries()) {
    await db.insert(agents).values({ ...a, sortOrder: i }).onConflictDoNothing();
  }
  for (const t of SCHEDULED_TEMPLATES) {
    const [exists] = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.name, t.name));
    if (!exists) {
      const { nextScheduledRun } = await import("./workflows/engine");
      await db.insert(workflows).values({ ...t, nextRunAt: nextScheduledRun(t.schedule) });
    }
  }
  const existingWf = await db.select().from(workflows);
  if (existingWf.length <= SCHEDULED_TEMPLATES.length && !existingWf.some((w) => w.name.startsWith("New project"))) {
    await db.insert(workflows).values([
      { name: "New project → research kickoff", description: "When a project is created, run the Research agent to assess gaps and create research tasks.",
        triggerType: "event", eventType: "project.created", mode: "automate", enabled: false,
        steps: [{ type: "run_agent", config: { agentKey: "research", instruction: "Initial research for {{entity.name}}" } },
                { type: "notify", config: { title: "Research kickoff done: {{entity.name}}" } }] },
      { name: "Discovery added → venture routing", description: "Match each new discovery to ventures using their configured services.",
        triggerType: "event", eventType: "discovery.created", mode: "automate", enabled: false,
        steps: [{ type: "run_agent", config: { agentKey: "business_development", instruction: "Route new discoveries" } }] },
      { name: "Qualified opportunity → follow-up cadence", description: "When an opportunity becomes qualified, schedule a follow-up and request approval before outreach.",
        triggerType: "event", eventType: "opportunity.status_changed", mode: "assist", enabled: false,
        conditions: [{ field: "qualificationStatus", op: "eq", value: "qualified" }],
        steps: [{ type: "schedule_follow_up", config: { title: "Follow up: {{entity.title}}", daysFromNow: 3, priority: "high" } },
                { type: "request_approval", config: { title: "Approve outreach for {{entity.title}}", risk: "high" } },
                { type: "run_agent", config: { agentKey: "outreach", instruction: "Introduce our services for this opportunity" } }] },
      { name: "Overdue task → escalate", description: "Escalate high-priority tasks once they become overdue.",
        triggerType: "event", eventType: "task.overdue", mode: "automate", enabled: false,
        conditions: [{ field: "priority", op: "in", value: ["high", "urgent"] }],
        steps: [{ type: "escalate", config: { title: "Overdue: {{entity.title}}" } }] },
      { name: "Daily executive brief", description: "Every morning, compile follow-ups, tasks and pending approvals.",
        triggerType: "schedule", schedule: { every: "day", at: "07:30" }, mode: "automate", enabled: false,
        steps: [{ type: "run_agent", config: { agentKey: "executive_assistant", instruction: "Daily brief" } }] },
      { name: "Weekly pipeline review", description: "Monday pipeline review: follow-ups for stalled opportunities.",
        triggerType: "schedule", schedule: { every: "week", weekday: 1, at: "08:00" }, mode: "automate", enabled: false,
        steps: [{ type: "run_agent", config: { agentKey: "sales", instruction: "Weekly pipeline review" } },
                { type: "run_agent", config: { agentKey: "operations", instruction: "Weekly health scan" } }] },
    ]);
  }
}
