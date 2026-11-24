/** Entity registry + generic create/update/delete services (used by server actions and tests). */
import { eq, asc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as F from "@/lib/fields";
import type { FieldDef, RefKey } from "@/lib/fields";
import * as form from "@/lib/form";
import { normalizeName, normalizeUrl } from "@/lib/normalize";
import { emitEvent, safeDelete } from "./core";

export type EntityKey = "projects" | "companies" | "contacts" | "opportunities" | "tasks" | "meetings" | "activities" | "news" | "discoveries" | "sources";

type Registry = { table: any; fields: FieldDef[]; event?: string; path: (id: string) => string; listPath: string; label: string; nameOf: (r: any) => string };

export const ENTITIES: Record<EntityKey, Registry> = {
  projects: { table: S.projects, fields: F.PROJECT_FIELDS, event: "project", path: (id) => `/projects/${id}`, listPath: "/projects", label: "Project", nameOf: (r) => r.name },
  companies: { table: S.companies, fields: F.COMPANY_FIELDS, path: (id) => `/companies/${id}`, listPath: "/companies", label: "Company", nameOf: (r) => r.name },
  contacts: { table: S.contacts, fields: F.CONTACT_FIELDS, path: (id) => `/contacts/${id}`, listPath: "/contacts", label: "Contact", nameOf: (r) => r.fullName },
  opportunities: { table: S.opportunities, fields: F.OPPORTUNITY_FIELDS, event: "opportunity", path: (id) => `/opportunities/${id}`, listPath: "/opportunities", label: "Opportunity", nameOf: (r) => r.title },
  tasks: { table: S.tasks, fields: F.TASK_FIELDS, path: () => `/tasks`, listPath: "/tasks", label: "Task", nameOf: (r) => r.title },
  meetings: { table: S.meetings, fields: F.MEETING_FIELDS, path: (id) => `/meetings/${id}/edit`, listPath: "/agenda", label: "Meeting", nameOf: (r) => r.title },
  activities: { table: S.activities, fields: F.ACTIVITY_FIELDS, path: () => `/activities`, listPath: "/activities", label: "Activity", nameOf: (r) => r.subject },
  news: { table: S.newsItems, fields: F.NEWS_FIELDS, event: "news", path: () => `/news`, listPath: "/news", label: "News item", nameOf: (r) => r.title },
  discoveries: { table: S.discoveries, fields: F.DISCOVERY_FIELDS, event: "discovery", path: (id) => `/discoveries/${id}`, listPath: "/discoveries", label: "Discovery", nameOf: (r) => r.title },
  sources: { table: S.sources, fields: F.SOURCE_FIELDS, path: () => `/`, listPath: "/", label: "Source", nameOf: (r) => r.title ?? r.url },
};

/** Parse FormData strictly against field definitions. Throws ValidationError. */
export function parseFields(fd: FormData, fields: FieldDef[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.type) {
      case "text": case "textarea": out[f.name] = form.str(fd, f.name, { required: f.required }); break;
      case "url": out[f.name] = form.url(fd, f.name, f.required); break;
      case "email": out[f.name] = form.email(fd, f.name); break;
      case "int": out[f.name] = form.int(fd, f.name); break;
      case "money": out[f.name] = form.money(fd, f.name); break;
      case "date": out[f.name] = form.dateStr(fd, f.name); break;
      case "datetime": {
        // Form inputs have no time zone: read them as Dubai time (UTC+4, no daylight saving).
        const s = form.str(fd, f.name);
        if (!s) { if (f.required) throw new form.ValidationError(`${f.label} is required`); out[f.name] = f.name === "occurredAt" ? new Date() : null; break; }
        const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.length === 16 ? s + ":00" : s}+04:00`);
        if (isNaN(d.getTime())) throw new form.ValidationError(`${f.label} is invalid`);
        out[f.name] = d; break;
      }
      case "select": { const s = form.str(fd, f.name); if (s !== null) out[f.name] = form.oneOf(fd, f.name, f.options!); else if (f.required) throw new form.ValidationError(`${f.label} is required`); break; }
      case "ref": out[f.name] = form.uuidOrNull(fd, f.name); break;
      case "checkbox": out[f.name] = form.bool(fd, f.name); break;
    }
    if (f.required && (out[f.name] === null || out[f.name] === undefined)) throw new form.ValidationError(`${f.label} is required`);
  }
  if ("relevance" in out && out.relevance !== null) {
    const r = Number(out.relevance);
    if (r < 1 || r > 5) throw new form.ValidationError("Relevance must be 1–5");
  }
  return out;
}

function derived(key: EntityKey, v: Record<string, any>) {
  const extra: Record<string, unknown> = {};
  if (key === "projects" || key === "companies") extra.normalizedName = normalizeName(v.name);
  if (key === "news" || key === "discoveries") {
    extra.normalizedTitle = normalizeName(v.title);
    extra.normalizedUrl = normalizeUrl(v.url);
  }
  if (key === "sources") extra.normalizedUrl = normalizeUrl(v.url);
  if (key === "tasks") extra.completedAt = v.status === "done" ? new Date() : null;
  if (key === "news" && v.relevance === null) v.relevance = 3;
  for (const k of Object.keys(v)) if (v[k] === null && ["status", "developmentStage", "procurementStage", "valueBasis", "verificationStatus", "category", "relationshipStatus", "qualificationStatus", "commercialStatus", "priority", "infoStatus", "kind"].includes(k)) delete v[k];
  return extra;
}

export async function createRecord(key: EntityKey, values: Record<string, any>, extra: Record<string, unknown> = {}) {
  const e = ENTITIES[key];
  const data = { ...values };
  const d = derived(key, data);
  if (key === "news") {
    const dup = await db.select({ id: S.newsItems.id }).from(S.newsItems).where(eq(S.newsItems.normalizedUrl, d.normalizedUrl as string));
    if (dup.length) throw new form.ValidationError("This news item already exists (same URL).");
  }
  const [row] = (await db.insert(e.table).values({ ...data, ...d, ...extra }).returning()) as any[];
  if (e.event) await emitEvent(`${e.event}.created`, e.event, row.id, {});
  return row;
}

export async function updateRecord(key: EntityKey, id: string, values: Record<string, any>) {
  const e = ENTITIES[key];
  const [before] = await db.select().from(e.table).where(eq(e.table.id, id));
  if (!before) throw new form.ValidationError(`${e.label} not found`);
  const data = { ...values };
  const d = derived(key, data);
  if (key === "tasks" && (before as any).status === "done" && data.status === "done") d.completedAt = (before as any).completedAt;
  if (key === "opportunities" && "commercialStatus" in data) {
    // Keep the CRM's closed date (used for win rate / targets) in step with edits made through the form
    const closed = ["won", "lost"].includes(data.commercialStatus as string);
    if (closed && !(before as any).closedAt) d.closedAt = new Date();
    if (!closed) { d.closedAt = null; d.lostReason = null; }
  }
  const [row] = (await db.update(e.table).set({ ...data, ...d, ...("updatedAt" in e.table ? { updatedAt: new Date() } : {}) }).where(eq(e.table.id, id)).returning()) as any[];
  if (e.event) {
    const statusField = key === "opportunities" ? ["qualificationStatus", "commercialStatus"] : ["status"];
    for (const f of statusField) {
      if ((before as any)[f] !== (row as any)[f]) {
        await emitEvent(`${e.event}.status_changed`, e.event, id, { field: f, from: (before as any)[f], to: (row as any)[f] });
        break;
      }
    }
  }
  return row;
}

export async function deleteRecord(key: EntityKey, id: string) {
  return safeDelete(ENTITIES[key].table, key, id);
}

/** Options for reference dropdowns. */
export async function refOptions(ref: RefKey): Promise<{ value: string; label: string; group?: string }[]> {
  switch (ref) {
    case "companies": return (await db.select({ value: S.companies.id, label: S.companies.name }).from(S.companies).orderBy(asc(S.companies.name)).limit(1000));
    case "projects": return (await db.select({ value: S.projects.id, label: S.projects.name }).from(S.projects).orderBy(asc(S.projects.name)).limit(1000));
    case "contacts": return (await db.select({ value: S.contacts.id, label: S.contacts.fullName }).from(S.contacts).orderBy(asc(S.contacts.fullName)).limit(1000));
    case "opportunities": return (await db.select({ value: S.opportunities.id, label: S.opportunities.title }).from(S.opportunities).orderBy(asc(S.opportunities.title)).limit(1000));
    case "sectors": return (await db.select({ value: S.sectors.id, label: S.sectors.name }).from(S.sectors).where(isNull(S.sectors.parentId)).orderBy(asc(S.sectors.sortOrder)));
    case "subsectors": {
      const rows = await db.execute(sql`select s.id as value, s.name as label, p.name as "group" from sectors s join sectors p on p.id = s.parent_id order by p.sort_order, s.sort_order`);
      return rows.rows as any;
    }
    case "ventures": return (await db.select({ value: S.ventures.id, label: S.ventures.name }).from(S.ventures).orderBy(asc(S.ventures.sortOrder)));
    case "stages": {
      const rows = await db.execute(sql`select s.id as value, s.name as label, v.name as "group" from pipeline_stages s join ventures v on v.id = s.venture_id order by v.sort_order, s.sort_order`);
      return rows.rows as any;
    }
  }
}

export async function loadRefOptions(fields: FieldDef[]) {
  const refs = [...new Set(fields.filter((f) => f.type === "ref").map((f) => f.ref!))];
  const entries = await Promise.all(refs.map(async (r) => [r, await refOptions(r)] as const));
  return Object.fromEntries(entries) as Partial<Record<RefKey, { value: string; label: string; group?: string }[]>>;
}

