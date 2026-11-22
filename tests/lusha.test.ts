import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const calls: { url: string; body: any; key: string | null }[] = [];
beforeAll(() => {
  process.env.LUSHA_API_KEY = "test-lusha-key";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, key: (init.headers as Record<string, string>)?.api_key ?? null });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/v3/contacts/prospecting")) {
      const company = body.filters.companies.include.names?.[0] ?? body.filters.companies.include.domains?.[0];
      if (company === "Nobody Corp") return json({ requestId: "r0", results: [] });
      return json({ requestId: "r1", billing: { creditsCharged: 2, lowBalance: false }, results: [
        { id: "L1", firstName: "Sara", lastName: "Haddad", jobTitle: { title: "Head of Procurement", seniority: "Director" }, company: { name: company }, socialLinks: { linkedin: "https://linkedin.com/in/sara" }, has: ["emails", "phones"] },
        { id: "L2", firstName: "Omar", lastName: "Aziz", jobTitle: { title: "Project Director", seniority: "Director" }, company: { name: company }, has: ["emails"] },
      ] });
    }
    if (url.endsWith("/v3/contacts/enrich")) {
      return json({ billing: { creditsCharged: 3 }, results: body.ids.map((id: string) => id === "L1"
        ? { id, fullName: "Sara Haddad", emails: [{ email: "Sara@Dev.example", type: "work" }, { email: "sara.h@mail.example", type: "private" }], phones: [{ number: "+971 50 123 4567", type: "mobile" }, { number: "+971 4 000 0000", type: "work", doNotCall: true }], jobTitle: { title: "Head of Procurement" }, socialLinks: { linkedin: "https://linkedin.com/in/sara" } }
        : { id, fullName: "Omar Aziz", emails: [{ email: "omar@dev.example", type: "work" }], phones: [], jobTitle: { title: "Project Director" } }) });
    }
    if (url.endsWith("/v3/account/usage")) return json({ credits: { total: 1000, used: 10, remaining: 990 } });
    return json({ message: "not found" }, 404);
  });
});
afterAll(() => { vi.unstubAllGlobals(); delete process.env.LUSHA_API_KEY; });

describe("Lusha decision-makers", () => {
  it("finds candidates for linked companies, reveals chosen ones into project contacts", async () => {
    const { db } = await import("@/db");
    const S = await import("@/db/schema");
    const { createRecord } = await import("@/server/entities");
    const { findDecisionMakers, revealCandidates } = await import("@/server/lusha");
    const p = await createRecord("projects", { name: "Lusha Test Tower" });
    const dev = await createRecord("companies", { name: "Skyline Developments", category: "developer" });
    await db.insert(S.projectCompanies).values({ projectId: p.id, companyId: dev.id, role: "developer" });

    const r = await findDecisionMakers(p.id);
    expect(r.searched).toBe(1); expect(r.added).toBe(2); expect(r.credits).toBe(2);
    const sent = calls.find((c) => c.url.endsWith("/prospecting"))!;
    expect(sent.key).toBe("test-lusha-key");
    expect(sent.body.filters.contacts.include.jobTitles).toContain("procurement");
    expect((await findDecisionMakers(p.id)).added).toBe(0); // no duplicates on re-run

    const cands = await db.select().from(S.contactCandidates).where(eq(S.contactCandidates.projectId, p.id));
    const sara = cands.find((c) => c.lushaId === "L1")!;
    const rev = await revealCandidates(p.id, [sara.id]);
    expect(rev).toMatchObject({ revealed: 1, withPhone: 1, withEmail: 1, credits: 3 });
    const [k] = await db.select().from(S.contacts).where(eq(S.contacts.lushaId, "L1"));
    expect(k.email).toBe("sara@dev.example");
    expect(k.phone).toBe("+971 50 123 4567");          // mobile preferred, do-not-call excluded
    expect(k.notes).toContain("sara.h@mail.example");   // extra email kept in notes
    expect(k.notes).not.toContain("000 0000");
    expect(k.companyId).toBe(dev.id);
    expect(k.contactSource).toMatch(/^Lusha/);
    const link = await db.select().from(S.projectContacts).where(and(eq(S.projectContacts.projectId, p.id), eq(S.projectContacts.contactId, k.id)));
    expect(link[0].role).toContain("Head of Procurement");
    expect((await revealCandidates(p.id, [sara.id])).revealed).toBe(0); // already revealed
  });

  it("explains when no companies are linked or nobody is found", async () => {
    const { createRecord } = await import("@/server/entities");
    const { findDecisionMakers } = await import("@/server/lusha");
    const { db } = await import("@/db");
    const S = await import("@/db/schema");
    const empty = await createRecord("projects", { name: "No Stakeholders Yet" });
    expect((await findDecisionMakers(empty.id)).errors[0]).toMatch(/No stakeholder companies/);
    const p2 = await createRecord("projects", { name: "Nobody Project" });
    const c = await createRecord("companies", { name: "Nobody Corp" });
    await db.insert(S.projectCompanies).values({ projectId: p2.id, companyId: c.id, role: "main_contractor" });
    const r = await findDecisionMakers(p2.id);
    expect(r.found).toBe(0); expect(r.errors).toEqual([]);
  });

  it("research agent proposes a Lusha search, which waits for approval", async () => {
    const { db } = await import("@/db");
    const S = await import("@/db/schema");
    const { createRecord } = await import("@/server/entities");
    const { startAgentRun, decideApproval } = await import("@/server/agents/runner");
    const { seedBase } = await import("@/server/seed");
    await seedBase();
    const p = await createRecord("projects", { name: "Agent Lusha Hotel" });
    const c = await createRecord("companies", { name: "Agent Lusha Developer" });
    await db.insert(S.projectCompanies).values({ projectId: p.id, companyId: c.id, role: "developer" });
    const run = await startAgentRun({ agentKey: "research", instruction: "research", targetType: "project", targetId: p.id });
    expect(run.status).toBe("awaiting_approval");
    const [a] = await db.select().from(S.approvals).where(eq(S.approvals.agentRunId, run.runId));
    expect(a.tool).toBe("find_decision_makers");
    await decideApproval(a.id, "approved");
    const cands = await db.select().from(S.contactCandidates).where(eq(S.contactCandidates.projectId, p.id));
    expect(cands.length).toBe(2);
  });

  it("saving a discovery links the reported developer as a company", async () => {
    const { createRecord } = await import("@/server/entities");
    const { saveDiscoveryAsProject } = await import("@/server/research");
    const { db } = await import("@/db");
    const S = await import("@/db/schema");
    const d = await createRecord("discoveries", { title: "Big resort by Oasis Holdings", developerName: "Oasis Holdings", operatorName: "Unknown" });
    const p = await saveDiscoveryAsProject(d.id, { name: "Oasis Resort", ventureIds: [] });
    const links = await db.select().from(S.projectCompanies).where(eq(S.projectCompanies.projectId, p.id));
    expect(links.map((l) => l.role)).toEqual(["developer"]);
  });
});
