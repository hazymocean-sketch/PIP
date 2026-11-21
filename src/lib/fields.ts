/** Declarative field definitions shared by forms (UI) and parsers (server). */
import * as C from "./constants";

export type RefKey = "companies" | "projects" | "contacts" | "opportunities" | "sectors" | "subsectors" | "ventures" | "stages";
export type FieldDef = {
  name: string; label: string;
  type: "text" | "textarea" | "url" | "email" | "int" | "money" | "date" | "select" | "ref" | "checkbox" | "datetime";
  options?: C.Option[]; ref?: RefKey; required?: boolean; help?: string; wide?: boolean; placeholder?: string; datalist?: string[];
};

export const PROJECT_FIELDS: FieldDef[] = [
  { name: "name", label: "Project name", type: "text", required: true, wide: true },
  { name: "projectType", label: "Project type", type: "text", placeholder: "e.g. 5-star resort, hotel refurbishment" },
  { name: "sectorId", label: "Sector", type: "ref", ref: "sectors" },
  { name: "subSectorId", label: "Sub-sector", type: "ref", ref: "subsectors" },
  { name: "status", label: "Status", type: "select", options: C.PROJECT_STATUS },
  { name: "city", label: "Location (emirate / city)", type: "text", datalist: C.LOCATIONS },
  { name: "country", label: "Country", type: "text" },
  { name: "address", label: "Address / area", type: "text", wide: true },
  { name: "brand", label: "Operator / hotel brand", type: "text", help: "Free text; link the operator company below for full records." },
  { name: "developmentStage", label: "Development stage", type: "select", options: C.DEVELOPMENT_STAGE },
  { name: "procurementStage", label: "Construction / procurement stage", type: "select", options: C.PROCUREMENT_STAGE },
  { name: "procurementPackages", label: "Potential procurement packages", type: "textarea", wide: true, placeholder: "FF&E, OS&E, feature finishes, signage…" },
  { name: "estimatedValue", label: "Estimated project value", type: "money" },
  { name: "valueCurrency", label: "Currency", type: "text" },
  { name: "valueBasis", label: "Value basis", type: "select", options: C.VALUE_BASIS, help: "Internal estimates are never shown as fact." },
  { name: "roomsUnits", label: "Rooms / keys / units", type: "int" },
  { name: "size", label: "Project size", type: "text", placeholder: "e.g. 45,000 sqm GFA" },
  { name: "announcementDate", label: "Announcement date", type: "date" },
  { name: "expectedCompletion", label: "Expected completion", type: "text", placeholder: "e.g. Q4 2027" },
  { name: "verificationStatus", label: "Verification", type: "select", options: C.VERIFICATION },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "researchNotes", label: "Research notes", type: "textarea", wide: true },
];

export const COMPANY_FIELDS: FieldDef[] = [
  { name: "name", label: "Company name", type: "text", required: true, wide: true },
  { name: "category", label: "Category", type: "select", options: C.COMPANY_CATEGORY },
  { name: "location", label: "Location", type: "text", datalist: C.LOCATIONS },
  { name: "country", label: "Country", type: "text" },
  { name: "website", label: "Website", type: "url" },
  { name: "verificationStatus", label: "Verification", type: "select", options: C.VERIFICATION },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const CONTACT_FIELDS: FieldDef[] = [
  { name: "fullName", label: "Full name", type: "text", required: true },
  { name: "position", label: "Position", type: "text" },
  { name: "companyId", label: "Company", type: "ref", ref: "companies" },
  { name: "relationshipStatus", label: "Relationship", type: "select", options: C.RELATIONSHIP_STATUS },
  { name: "email", label: "Professional email", type: "email", help: "Only if publicly available or provided by you. Never guessed." },
  { name: "phone", label: "Professional phone", type: "text" },
  { name: "profileUrl", label: "LinkedIn / profile URL", type: "url", wide: true },
  { name: "contactSource", label: "Where this contact came from", type: "text", wide: true, placeholder: "e.g. Company website team page, met at event" },
  { name: "verificationStatus", label: "Verification", type: "select", options: C.VERIFICATION },
  { name: "notes", label: "Research notes", type: "textarea", wide: true },
];

export const OPPORTUNITY_FIELDS: FieldDef[] = [
  { name: "title", label: "Opportunity title", type: "text", required: true, wide: true },
  { name: "projectId", label: "Associated project", type: "ref", ref: "projects" },
  { name: "ventureId", label: "Business venture", type: "ref", ref: "ventures" },
  { name: "stageId", label: "Pipeline stage", type: "ref", ref: "stages" },
  { name: "opportunityType", label: "Opportunity type", type: "text", placeholder: "FF&E supply, special finishes, branding…" },
  { name: "qualificationStatus", label: "Qualification", type: "select", options: C.QUALIFICATION_STATUS },
  { name: "commercialStatus", label: "Commercial status", type: "select", options: C.COMMERCIAL_STATUS },
  { name: "priority", label: "Priority", type: "select", options: C.PRIORITY },
  { name: "estimatedValue", label: "Estimated value", type: "money" },
  { name: "valueCurrency", label: "Currency", type: "text" },
  { name: "followUpDate", label: "Follow-up date", type: "date" },
  { name: "nextAction", label: "Next action", type: "text", wide: true },
  { name: "scope", label: "Potential scope", type: "textarea", wide: true },
  { name: "decisionMakers", label: "Potential decision-makers", type: "textarea", wide: true, help: "Link verified contacts below; use this for roles still to identify." },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const TASK_FIELDS: FieldDef[] = [
  { name: "title", label: "Task", type: "text", required: true, wide: true },
  { name: "priority", label: "Priority", type: "select", options: C.PRIORITY },
  { name: "status", label: "Status", type: "select", options: C.TASK_STATUS },
  { name: "dueDate", label: "Due date", type: "date" },
  { name: "projectId", label: "Project", type: "ref", ref: "projects" },
  { name: "opportunityId", label: "Opportunity", type: "ref", ref: "opportunities" },
  { name: "companyId", label: "Company", type: "ref", ref: "companies" },
  { name: "contactId", label: "Contact", type: "ref", ref: "contacts" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const ACTIVITY_FIELDS: FieldDef[] = [
  { name: "subject", label: "Subject", type: "text", required: true, wide: true },
  { name: "type", label: "Type", type: "select", options: C.ACTIVITY_TYPE, required: true },
  { name: "occurredAt", label: "Date & time", type: "datetime" },
  { name: "projectId", label: "Project", type: "ref", ref: "projects" },
  { name: "opportunityId", label: "Opportunity", type: "ref", ref: "opportunities" },
  { name: "companyId", label: "Company", type: "ref", ref: "companies" },
  { name: "contactId", label: "Contact", type: "ref", ref: "contacts" },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
  { name: "outcome", label: "Outcome / decision", type: "textarea", wide: true },
];

export const NEWS_FIELDS: FieldDef[] = [
  { name: "title", label: "Headline", type: "text", required: true, wide: true },
  { name: "url", label: "Original URL", type: "url", required: true, wide: true },
  { name: "sourceName", label: "Source", type: "text", placeholder: "e.g. Hotelier Middle East" },
  { name: "publishedAt", label: "Publication date", type: "date" },
  { name: "category", label: "Category", type: "select", options: C.NEWS_CATEGORY },
  { name: "relevance", label: "Relevance (1–5)", type: "int" },
  { name: "sectorId", label: "Sector", type: "ref", ref: "sectors" },
  { name: "location", label: "Location", type: "text", datalist: C.LOCATIONS },
  { name: "developerId", label: "Developer", type: "ref", ref: "companies" },
  { name: "projectId", label: "Associated project", type: "ref", ref: "projects" },
  { name: "summary", label: "Short summary", type: "textarea", wide: true },
];

export const DISCOVERY_FIELDS: FieldDef[] = [
  { name: "title", label: "What was found", type: "text", required: true, wide: true, placeholder: "e.g. New 300-key resort announced on Al Marjan Island" },
  { name: "kind", label: "Discovery type", type: "select", options: C.DISCOVERY_KIND },
  { name: "url", label: "Source URL", type: "url", wide: true },
  { name: "sourceName", label: "Source name", type: "text" },
  { name: "publishedAt", label: "Publication date", type: "date" },
  { name: "sectorId", label: "Sector", type: "ref", ref: "sectors" },
  { name: "location", label: "Location", type: "text", datalist: C.LOCATIONS },
  { name: "developerName", label: "Developer (as reported)", type: "text" },
  { name: "operatorName", label: "Operator / brand (as reported)", type: "text" },
  { name: "infoStatus", label: "Information status", type: "select", options: C.INFO_STATUS },
  { name: "summary", label: "Summary / extract", type: "textarea", wide: true },
];

export const SOURCE_FIELDS: FieldDef[] = [
  { name: "url", label: "URL", type: "url", wide: true },
  { name: "sourceName", label: "Source name", type: "text" },
  { name: "title", label: "Article / page title", type: "text" },
  { name: "publishedAt", label: "Published", type: "date" },
  { name: "accessedAt", label: "Accessed", type: "date" },
  { name: "supportsField", label: "Supports which fact", type: "text", placeholder: "e.g. developer, completion date" },
  { name: "infoStatus", label: "Information status", type: "select", options: C.INFO_STATUS },
  { name: "extractedInfo", label: "Relevant information extracted", type: "textarea", wide: true },
];
