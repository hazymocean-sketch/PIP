/** Controlled vocabularies. Values are stored as text; labels are for display. */
export type Option = { value: string; label: string };
const o = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const PROJECT_STATUS = o([
  ["new", "Newly discovered"], ["under_research", "Under research"], ["research_completed", "Research completed"],
  ["verified", "Verified"], ["qualified", "Qualified"], ["active_opportunity", "Active opportunity"],
  ["won", "Won"], ["lost", "Lost"], ["on_hold", "On hold"], ["cancelled", "Cancelled"],
]);

export const DEVELOPMENT_STAGE = o([
  ["unknown", "Unknown"], ["announced", "Announced"], ["planning", "Planning / design"],
  ["approved", "Approved / permitted"], ["tendering", "Tendering"], ["under_construction", "Under construction"],
  ["fit_out", "Fit-out"], ["completed", "Completed / opened"], ["refurbishment", "Refurbishment"],
]);

export const PROCUREMENT_STAGE = o([
  ["unknown", "Unknown"], ["not_started", "Not started"], ["consultant_appointment", "Consultant appointment"],
  ["design_development", "Design development"], ["ffe_specification", "FF&E specification"],
  ["tender_open", "Tender open"], ["tender_closed", "Tender closed"], ["awarded", "Awarded"],
]);

export const VERIFICATION = o([
  ["unverified", "Unverified"], ["partially_verified", "Partially verified"], ["verified", "Verified"],
]);

/** Information status for every claim / source / discovery. */
export const INFO_STATUS = o([
  ["confirmed", "Confirmed"], ["reported", "Reported — not independently verified"],
  ["inferred", "AI / analyst inference"], ["unknown", "Unknown"],
]);

export const VALUE_BASIS = o([
  ["unknown", "Unknown"], ["reported", "Reported by source"], ["confirmed", "Confirmed"], ["estimate", "Internal estimate (not fact)"],
]);

export const COMPANY_CATEGORY = o([
  ["developer", "Developer"], ["owner", "Owner"], ["operator", "Hotel operator"], ["consultant", "Consultant"],
  ["architect", "Architect"], ["interior_designer", "Interior designer"], ["main_contractor", "Main contractor"],
  ["fitout_contractor", "Fit-out contractor"], ["project_manager", "Project management"], ["procurement", "Procurement company"],
  ["supplier", "Supplier"], ["partner", "Partner"], ["other", "Other"],
]);

export const PROJECT_ROLES = COMPANY_CATEGORY.filter((c) => !["supplier", "partner"].includes(c.value));

export const RELATIONSHIP_STATUS = o([
  ["not_contacted", "Not contacted"], ["identified", "Identified"], ["contacted", "Contacted"],
  ["in_discussion", "In discussion"], ["relationship", "Active relationship"], ["dormant", "Dormant"], ["do_not_contact", "Do not contact"],
]);

export const QUALIFICATION_STATUS = o([
  ["unqualified", "Unqualified"], ["qualifying", "Qualifying"], ["qualified", "Qualified"], ["disqualified", "Disqualified"],
]);

export const COMMERCIAL_STATUS = o([
  ["open", "Open"], ["proposal", "Proposal / quotation"], ["negotiation", "Negotiation"], ["won", "Won"], ["lost", "Lost"], ["on_hold", "On hold"],
]);

export const PRIORITY = o([["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]]);

export const TASK_STATUS = o([["open", "Open"], ["in_progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"], ["cancelled", "Cancelled"]]);

export const ACTIVITY_TYPE = o([
  ["meeting", "Meeting"], ["call", "Call"], ["email", "Email"], ["site_visit", "Site visit"], ["client_discussion", "Client discussion"],
  ["research", "Research"], ["project_update", "Project update"], ["decision", "Important decision"],
]);

export const NEWS_CATEGORY = o([
  ["development", "Development announcement"], ["hotel_resort", "Hotel / resort announcement"], ["construction", "Construction news"],
  ["developer", "Developer news"], ["award", "Project award"], ["tender", "Tender announcement"], ["appointment", "Procurement / appointment"],
  ["delay_cancellation", "Delay / cancellation"], ["refurbishment", "Refurbishment / expansion"],
]);

export const DISCOVERY_STATUS = o([
  ["new", "New — awaiting review"], ["needs_verification", "Needs verification"], ["saved", "Saved as project"], ["rejected", "Rejected"],
]);

export const DISCOVERY_KIND = o([
  ["project", "Project"], ["company", "Company / client"], ["property", "Property"], ["decision_maker", "Decision-maker"],
  ["partnership", "Partnership"], ["market", "Market opportunity"],
]);

export const RESEARCH_KIND = o([
  ["discovery", "Discovery search"], ["project", "Project research"], ["company", "Developer / company research"],
  ["announcement", "Announcement investigation"], ["stakeholders", "Stakeholder identification"],
  ["status", "Status update"], ["procurement", "Procurement / tender search"],
]);

export const LOCATIONS = [
  "Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah", "Al Ain",
  "Saudi Arabia", "Qatar", "Oman", "Bahrain", "Kuwait",
];

export const AUTONOMY_MODES = o([
  ["assist", "Assist — research, analyse, recommend"],
  ["automate", "Automate — run approved routine workflows"],
  ["autonomous", "Autonomous — act within explicit limits"],
]);

export const RUN_STATUS = o([
  ["queued", "Queued"], ["running", "Running"], ["awaiting_approval", "Awaiting approval"], ["completed", "Completed"],
  ["failed", "Failed"], ["retrying", "Retrying"], ["cancelled", "Cancelled"],
]);

export const EVENT_TYPES = o([
  ["project.created", "Project created"], ["project.status_changed", "Project status changed"],
  ["discovery.created", "Discovery added"], ["discovery.saved", "Discovery saved as project"],
  ["opportunity.created", "Opportunity created"], ["opportunity.status_changed", "Opportunity status changed"],
  ["news.created", "News item added"], ["task.overdue", "Task overdue"], ["approval.decided", "Approval decided"],
]);

export function label(opts: Option[], value: string | null | undefined, fallback = "Unknown") {
  if (!value) return fallback;
  return opts.find((x) => x.value === value)?.label ?? value;
}
