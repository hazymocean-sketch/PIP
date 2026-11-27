"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Hint } from "./client";

type Opt = { value: string; label: string };
type Phase = "idle" | "starting" | "running" | "done" | "error";

export function DiscoveryRunner({ sectors, locations, providerLabel }: { sectors: Opt[]; locations: string[]; providerLabel: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [queries, setQueries] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [stats, setStats] = useState({ created: 0, skipped: 0, issues: 0 });
  const [eta, setEta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const started = useRef(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setPhase("starting"); setError(null); setStats({ created: 0, skipped: 0, issues: 0 }); setStep(0); setEta(null);
    try {
      const res = await fetch("/api/discovery/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.status === 401 ? "Your session expired — sign in again." : "Could not start the search.");
      const s = (await res.json()) as { sessionId: string; queries: string[]; provider: { label: string } | null };
      setSessionId(s.sessionId);
      if (!s.provider) { router.push(`/research/${s.sessionId}?ok=${encodeURIComponent("Manual mode: open the search links, then add what you find")}`); return; }
      setQueries(s.queries); setPhase("running"); started.current = Date.now();
      const totals = { created: 0, skipped: 0, errors: [] as string[] };
      for (let i = 0; i < s.queries.length; i++) {
        setStep(i);
        const t0 = Date.now();
        try {
          const r = await fetch("/api/discovery/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: s.sessionId, query: s.queries[i] }) });
          const j = (await r.json()) as { created: number; skipped: number; errors: string[] };
          totals.created += j.created ?? 0; totals.skipped += j.skipped ?? 0; totals.errors.push(...(j.errors ?? []));
        } catch { totals.errors.push(`Search “${s.queries[i]}” could not be reached`); }
        setStats({ created: totals.created, skipped: totals.skipped, issues: totals.errors.length });
        const avg = (Date.now() - started.current) / (i + 1);
        setEta(Math.max(0, Math.round((avg * (s.queries.length - i - 1)) / 1000)));
        void t0;
      }
      setStep(s.queries.length);
      await fetch("/api/discovery/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: s.sessionId, ...totals }) });
      setPhase("done");
      setTimeout(() => router.push(`/research/${s.sessionId}?ok=${encodeURIComponent(`${totals.created} new discoveries saved · ${totals.skipped} duplicates skipped`)}`), 1600);
    } catch (err) {
      setError((err as Error).message); setPhase("error");
    }
  }

  const total = queries.length || 1;
  const pct = phase === "done" ? 100 : phase === "running" ? Math.round((step / total) * 100) : 0;
  const busy = phase === "starting" || phase === "running";

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: 12 }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="fields">
          <div className="field wide"><label htmlFor="dq">What to look for (optional)</label><input id="dq" name="query" placeholder="e.g. new upcoming hotels Riyadh" /></div>
          <div className="field"><label>Sector <Hint text="Pick a sector to run its ready-made searches (up to 6). Leave it on Any to search only your own words — or general project news if you type nothing." /></label><select name="sectorId"><option value="">Any</option>{sectors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          <div className="field"><label>Location</label><input name="location" list="disc-locs" placeholder="UAE" /><datalist id="disc-locs">{locations.map((l) => <option key={l} value={l} />)}</datalist></div>
          <div className="field"><label>Published from</label><input type="date" name="dateFrom" /></div>
        </div>
      </fieldset>

      {phase === "idle" || phase === "error" ? (
        <div className="row">
          <button className="btn primary" type="submit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>Run discovery</button>
          {error ? <span className="small" style={{ color: "var(--bad)" }}>{error}</span> : null}
        </div>
      ) : (
        <div className="search-progress" role="status" aria-live="polite">
          <div className="sp-top">
            <span className={`sp-pulse${phase === "done" ? " done" : ""}`} />
            <span className="sp-state">{phase === "starting" ? "Preparing searches…" : phase === "done" ? "Search complete" : `Searching the web via ${providerLabel ?? "search"}…`}</span>
            <span className="sp-pct">{pct}<small>%</small></span>
          </div>
          <div className="sp-bar"><span style={{ width: `${pct}%` }} className={phase === "done" ? "done" : ""} /></div>
          <div className="sp-meta">
            {phase === "running" && queries[step] ? <span className="sp-q">Search {step + 1} of {queries.length}: “{queries[step]}”</span> : <span className="sp-q">{phase === "done" ? `Opening results…` : " "}</span>}
            <span className="sp-eta">{phase === "running" ? (eta === null ? "estimating time…" : eta > 0 ? `~${eta}s left` : "almost done") : ""}</span>
          </div>
          <div className="sp-stats">
            <span><b>{stats.created}</b> new</span><span><b>{stats.skipped}</b> duplicates skipped</span>{stats.issues ? <span className="bad"><b>{stats.issues}</b> issues</span> : null}
          </div>
          {phase === "done" && sessionId ? <a className="btn sm" href={`/research/${sessionId}`}>View results now</a> : null}
        </div>
      )}
    </form>
  );
}
