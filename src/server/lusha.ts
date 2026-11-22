/**
 * Lusha integration (API v3, search-then-enrich).
 *
 *  1. findDecisionMakers(project): for each stakeholder company on the project
 *     (developer, owner, operator, consultant, designer, contractor, PM, procurement),
 *     search Lusha for senior people in relevant roles → stored as candidates.
 *     Billing: Lusha charges per search result.
 *  2. revealCandidates(ids): reveal emails + phones for the people YOU choose →
 *     saved as Contacts, linked to the company and the project.
 *     Billing: per revealed field.
 *
 * The API key lives only in the server env var LUSHA_API_KEY. Nothing is guessed:
 * only data Lusha returns is stored, and each contact records "Lusha" as its source.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactCandidates, contacts, projectContacts, projects, opportunityContacts } from "@/db/schema";
import { notify } from "./core";

const BASE = "https://api.lusha.com";

/** Roles worth calling, per stakeholder type. Lusha matches job titles loosely. */
const TITLES_BY_ROLE: Record<string, string[]> = {
  developer: ["procurement", "development director", "project director", "head of projects", "design manager", "CEO", "managing director"],
  owner: ["procurement", "asset manager", "project director", "general manager", "CEO"],
  operator: ["procurement", "pre-opening", "technical services", "design", "project director", "general manager"],
  consultant: ["project director", "project manager", "design director", "associate director"],
  architect: ["design director", "project architect", "associate director", "partner"],
  interior_designer: ["design director", "interior design", "FF&E", "associate director", "founder"],
  main_contractor: ["procurement", "project director", "project manager", "estimation", "commercial manager"],
  fitout_contractor: ["procurement", "project manager", "estimation", "operations director", "managing director"],
  project_manager: ["project director", "project manager", "procurement"],
  procurement: ["procurement", "purchasing", "FF&E", "director"],
};
const DEFAULT_TITLES = ["procurement", "project director", "managing director", "CEO"];
const ROLE_PRIORITY = ["developer", "owner", "operator", "interior_designer", "fitout_contractor", "main_contractor", "procurement", "project_manager", "consultant", "architect"];

export type LushaPreview = {
  id: string; firstName?: string; lastName?: string;
  jobTitle?: { title?: string; departments?: string[]; seniority?: string };
  company?: { id?: string; name?: string; domain?: string };
  socialLinks?: { linkedin?: string };
  has?: string[];
  canReveal?: { field: string; credits?: number }[];
};
export type LushaContact = LushaPreview & {
  fullName?: string;
  emails?: { email: string; type?: string; confidence?: string }[];
  phones?: { number: string; type?: string; doNotCall?: boolean }[];
  error?: { code?: string; message?: string };
};

export function lushaConfigured() { return !!process.env.LUSHA_API_KEY; }

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.LUSHA_API_KEY;
  if (!key) throw new Error("Lusha is not connected (LUSHA_API_KEY missing)");
  const res = await fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: { api_key: key, "content-type": "application/json", accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try { const j = JSON.parse(text); msg = j.message ?? j.error?.message ?? msg; } catch { /* keep text */ }
    const hint = res.status === 401 ? " (check the API key)" : res.status === 402 ? " (not enough Lusha credits)" : res.status === 403 ? " (API access not enabled on this Lusha plan)" : res.status === 429 ? " (rate limit — try again shortly)" : "";
    throw new Error(`Lusha ${res.status}: ${msg}${hint}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const lusha = {
  usage: () => call<{ credits?: { total?: number; used?: number; remaining?: number }; plan?: { category?: string } }>("/v3/account/usage"),

  async prospect(company: { name: string; domain?: string | null }, titles: string[], size = 10) {
    const companiesInclude: Record<string, string[]> = company.domain ? { domains: [company.domain] } : { names: [company.name] };
    const body = (withTitles: boolean) => ({
      pagination: { page: 0, size: Math.max(10, Math.min(size, 25)) },
      filters: { companies: { include: companiesInclude }, ...(withTitles ? { contacts: { include: { jobTitles: titles } } } : {}) },
      options: { maxContactsPerCompany: 6, excludeDnc: true },
    });
    type R = { requestId?: string; results?: LushaPreview[]; billing?: { creditsCharged?: number; lowBalance?: boolean } };
    let r = await call<R>("/v3/contacts/prospecting", { method: "POST", body: body(true) });
    // If the title filter matched nobody, retry once without it (senior people are still returned first).
    if (!(r.results ?? []).length) r = await call<R>("/v3/contacts/prospecting", { method: "POST", body: body(false) });
    return r;
  },

  enrich: (ids: string[]) =>
    call<{ results?: LushaContact[]; billing?: { creditsCharged?: number; lowBalance?: boolean } }>("/v3/contacts/enrich", { method: "POST", body: { ids, reveal: ["emails", "phones"] } }),
};

function domainOf(website: string | null | undefined) {
  if (!website) return null;
  try { return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** Step 1 — search Lusha for decision-makers at each stakeholder company of the project. */
export async function findDecisionMakers(projectId: string, opts: { companyIds?: string[] } = {}) {
  const linked = (await db.execute(sql`select c.id, c.name, c.website, pc.role from project_companies pc join companies c on c.id = pc.company_id
    where pc.project_id = ${projectId}`)).rows as { id: string; name: string; website: string | null; role: string }[];
  const targets = linked
    .filter((c) => !opts.companyIds?.length || opts.companyIds.includes(c.id))
    .filter((c) => !c.name.startsWith("[DEMO]"))
    .sort((a, b) => (ROLE_PRIORITY.indexOf(a.role) + 99) % 99 - (ROLE_PRIORITY.indexOf(b.role) + 99) % 99)
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .slice(0, 6);
  if (!targets.length) return { searched: 0, found: 0, added: 0, credits: 0, errors: ["No stakeholder companies linked to this project yet — link the developer, contractor, consultant or designer first."], lowBalance: false };

  let found = 0, added = 0, credits = 0, lowBalance = false; const errors: string[] = [];
  for (const c of targets) {
    try {
      const r = await lusha.prospect({ name: c.name, domain: domainOf(c.website) }, TITLES_BY_ROLE[c.role] ?? DEFAULT_TITLES);
      credits += r.billing?.creditsCharged ?? 0; lowBalance ||= !!r.billing?.lowBalance;
      for (const p of r.results ?? []) {
        if (!p.id) continue;
        found++;
        const ins = await db.insert(contactCandidates).values({
          projectId, companyId: c.id, companyRole: c.role, lushaId: String(p.id), firstName: p.firstName ?? null, lastName: p.lastName ?? null,
          jobTitle: p.jobTitle?.title ?? null, seniority: p.jobTitle?.seniority ?? null, departments: p.jobTitle?.departments ?? null,
          companyName: p.company?.name ?? c.name, linkedin: p.socialLinks?.linkedin ?? null,
          available: p.has ?? (p.canReveal ?? []).map((x) => x.field),
          revealCredits: (p.canReveal ?? []).reduce((s, x) => s + (x.credits ?? 0), 0) || null,
        }).onConflictDoNothing().returning({ id: contactCandidates.id });
        if (ins.length) added++;
      }
    } catch (e) { errors.push(`${c.name}: ${(e as Error).message}`); }
  }
  if (added) {
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));
    await notify(`${added} decision-maker(s) found for ${p?.name ?? "a project"}`, "Choose whose email and phone to reveal.", "info", `/projects/${projectId}#decision-makers`);
  }
  return { searched: targets.length, found, added, credits, errors, lowBalance };
}

/** Step 2 — reveal emails/phones for chosen candidates and save them as contacts on the project. */
export async function revealCandidates(projectId: string, candidateIds: string[], opts: { opportunityId?: string } = {}) {
  const cands = await db.select().from(contactCandidates)
    .where(and(eq(contactCandidates.projectId, projectId), inArray(contactCandidates.id, candidateIds), eq(contactCandidates.status, "suggested")));
  if (!cands.length) return { revealed: 0, withPhone: 0, withEmail: 0, credits: 0, errors: [] as string[], lowBalance: false };
  const r = await lusha.enrich(cands.map((c) => c.lushaId));
  const byId = new Map((r.results ?? []).map((x) => [String(x.id), x]));
  let revealed = 0, withPhone = 0, withEmail = 0; const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const c of cands) {
    const x = byId.get(c.lushaId);
    if (!x || x.error) { errors.push(`${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.lushaId}: ${x?.error?.message ?? "no data returned"}`); continue; }
    const emails = (x.emails ?? []).filter((e) => e.email);
    const phones = (x.phones ?? []).filter((p) => p.number && !p.doNotCall);
    const workEmail = emails.find((e) => e.type === "work") ?? emails[0];
    const bestPhone = phones.find((p) => p.type === "mobile") ?? phones.find((p) => p.type === "direct") ?? phones[0];
    const extras = [
      ...emails.filter((e) => e !== workEmail).map((e) => `Email (${e.type ?? "other"}): ${e.email}`),
      ...phones.filter((p) => p !== bestPhone).map((p) => `Phone (${p.type ?? "other"}): ${p.number}`),
    ];
    const fullName = x.fullName || [x.firstName ?? c.firstName, x.lastName ?? c.lastName].filter(Boolean).join(" ") || "Unknown name";

    // Reuse an existing contact (same Lusha ID, or same name at the same company)
    const [existing] = await db.select().from(contacts).where(
      c.companyId
        ? sql`${contacts.lushaId} = ${c.lushaId} or (lower(${contacts.fullName}) = lower(${fullName}) and ${contacts.companyId} = ${c.companyId})`
        : eq(contacts.lushaId, c.lushaId));
    const values = {
      fullName, position: x.jobTitle?.title ?? c.jobTitle, companyId: c.companyId,
      email: workEmail?.email?.toLowerCase() ?? existing?.email ?? null, phone: bestPhone?.number ?? existing?.phone ?? null,
      profileUrl: x.socialLinks?.linkedin ?? c.linkedin ?? existing?.profileUrl ?? null, lushaId: c.lushaId,
      relationshipStatus: existing?.relationshipStatus ?? "identified", verificationStatus: "partially_verified",
      contactSource: `Lusha (revealed ${today})`,
      notes: [existing?.notes, extras.length ? `From Lusha:\n${extras.join("\n")}` : null].filter(Boolean).join("\n\n") || null,
      updatedAt: new Date(),
    };
    const contactId = existing
      ? (await db.update(contacts).set(values).where(eq(contacts.id, existing.id)).returning({ id: contacts.id }))[0].id
      : (await db.insert(contacts).values(values).returning({ id: contacts.id }))[0].id;
    await db.insert(projectContacts).values({ projectId, contactId, role: [labelRole(c.companyRole), x.jobTitle?.title ?? c.jobTitle].filter(Boolean).join(" · ").slice(0, 200) }).onConflictDoNothing();
    if (opts.opportunityId) await db.insert(opportunityContacts).values({ opportunityId: opts.opportunityId, contactId }).onConflictDoNothing();
    await db.update(contactCandidates).set({ status: "revealed", contactId }).where(eq(contactCandidates.id, c.id));
    revealed++; if (values.phone) withPhone++; if (values.email) withEmail++;
  }
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  return { revealed, withPhone, withEmail, credits: r.billing?.creditsCharged ?? 0, errors, lowBalance: !!r.billing?.lowBalance };
}

export async function dismissCandidates(projectId: string, candidateIds: string[]) {
  await db.update(contactCandidates).set({ status: "dismissed" }).where(and(eq(contactCandidates.projectId, projectId), inArray(contactCandidates.id, candidateIds)));
}

function labelRole(role: string | null) {
  if (!role) return null;
  return role.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** LinkedIn search links (opening LinkedIn in your own browser — no scraping). */
export function linkedinPeopleSearch(name: string, company?: string | null) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([name, company].filter(Boolean).join(" "))}`;
}
export function linkedinCompanySearch(company: string) {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;
}

