import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactCandidates } from "@/db/schema";
import { findDecisionMakersAction, revealContactsAction } from "@/server/actions";
import { linkedinPeopleSearch, lushaConfigured } from "@/server/lusha";
import { Card, Empty, Badge, Hint } from "./ui";
import { Submit } from "./client";
import { Icon } from "./icons";

const ROLE = (r: string | null) => (r ? r.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Company");

export async function DecisionMakers({ projectId, opportunityId }: { projectId: string; opportunityId?: string }) {
  const ctx = opportunityId ? <input type="hidden" name="_opportunityId" value={opportunityId} /> : null;
  const configured = lushaConfigured();
  const [linkedR, cands, revealedR] = await Promise.all([
    db.execute(sql`select distinct c.id, c.name, pc.role from project_companies pc join companies c on c.id = pc.company_id where pc.project_id = ${projectId} order by c.name`),
    db.select().from(contactCandidates).where(and(eq(contactCandidates.projectId, projectId), eq(contactCandidates.status, "suggested"))).orderBy(contactCandidates.companyName),
    db.execute(sql`select count(*)::int as n from contact_candidates where project_id = ${projectId} and status = 'revealed'`),
  ]);
  const linked = linkedR.rows as { id: string; name: string; role: string }[];
  const revealedCount = revealedR.rows[0] as { n: number };
  const groups = [...new Set(cands.map((c) => c.companyName ?? "Unknown company"))];

  return (
    <Card id="decision-makers" title="Decision-makers" sub="Step 1: Find people searches Lusha for senior people (procurement, project, design, leadership) at each stakeholder company on this project. Step 2: tick who you want, then reveal their email and phone — they're saved to People below. Lusha charges credits per search result and per revealed field."
      actions={configured ? <span className="badge good">Lusha connected</span> : <span className="badge outline">Lusha not connected</span>} tight>
      {!configured ? <div className="card-b"><div className="notice">Add <code>LUSHA_API_KEY</code> in Vercel to enable decision-maker lookups.</div></div> : (
        <>
          <form action={findDecisionMakersAction.bind(null, projectId)} className="card-b stack" style={{ gap: 10 }}>{ctx}
            {linked.length ? (
              <>
                <span className="lbl-s">Search these companies <Hint text="Untick any company you don't want to search. Adding a company's website improves matching (Lusha matches exact domains best)." /></span>
                <div className="row" style={{ gap: 14 }}>
                  {linked.map((c) => { const demo = c.name.startsWith("[DEMO]"); return <label key={c.id + c.role} className="check small" style={demo ? { opacity: .5 } : undefined} title={demo ? "Demo companies are never searched (saves credits)" : undefined}><input type="checkbox" name="companyId" value={c.id} defaultChecked={!demo} disabled={demo} /> {c.name} <span className="faint">· {ROLE(c.role)}{demo ? " · demo, skipped" : ""}</span></label>; })}
                </div>
                <div className="row"><Submit className="btn primary" pendingText="Searching Lusha…"><Icon name="network" />Find decision-makers</Submit>
                  {revealedCount.n ? <span className="muted small">{revealedCount.n} already revealed for this project</span> : null}</div>
              </>
            ) : <div className="notice">Link at least one stakeholder company (developer, contractor, consultant, interior designer…) under <b>Stakeholder companies</b>, then come back here.</div>}
          </form>
          {cands.length ? (
            <form action={revealContactsAction.bind(null, projectId)}>{ctx}
              {groups.map((g) => (
                <div key={g}>
                  <div className="lbl-s" style={{ padding: "12px 16px 6px", borderTop: "1px solid var(--glass-line)" }}>{g} · {ROLE(cands.find((c) => (c.companyName ?? "Unknown company") === g)?.companyRole ?? null)}</div>
                  <div className="list">
                    {cands.filter((c) => (c.companyName ?? "Unknown company") === g).map((c) => {
                      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Name hidden";
                      const av = c.available ?? [];
                      return (
                        <label key={c.id} className="li" style={{ cursor: "pointer" }}>
                          <input type="checkbox" name="candidateId" value={c.id} style={{ marginTop: 3 }} />
                          <div className="grow"><div className="ttl">{name}</div><div className="meta">{c.jobTitle ?? "Title unknown"}{c.seniority ? ` · ${c.seniority}` : ""}</div></div>
                          <span className="row" style={{ gap: 4 }}>
                            {av.includes("phones") ? <Badge tone="info">Phone</Badge> : null}{av.includes("emails") ? <Badge tone="info">Email</Badge> : null}
                            {!av.length ? <Badge tone="outline">Limited data</Badge> : null}
                          </span>
                          <a className="btn ghost sm icon-only" href={c.linkedin ?? linkedinPeopleSearch(name, c.companyName)} target="_blank" rel="noopener noreferrer" title="Open on LinkedIn" aria-label="Open on LinkedIn"><Icon name="external" /></a>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="row" style={{ padding: "12px 16px", borderTop: "1px solid var(--glass-line)" }}>
                <Submit className="btn primary" name="intent" value="reveal" pendingText="Revealing…"><Icon name="check" />Reveal email &amp; phone</Submit>
                <Submit className="btn ghost" name="intent" value="dismiss" pendingText="Removing…">Remove from list</Submit>
                <Hint text={`Only the people you tick are revealed. Revealed contacts appear under People on the project${opportunityId ? ", on this opportunity" : ""} and in Network → Contacts, with their source marked as Lusha.`} />
              </div>
            </form>
          ) : <Empty title="No suggestions yet">Click Find decision-makers to search Lusha.</Empty>}
        </>
      )}
    </Card>
  );
}
