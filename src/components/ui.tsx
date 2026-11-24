import Link from "next/link";
import { Hint } from "./client";
import { Icon } from "./icons";
export { Hint };
import type { ReactNode } from "react";
import * as C from "@/lib/constants";
import { scoreBand } from "@/lib/scoring";

export function PageHead({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { href: string; label: string }[]; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs?.length ? <div className="crumbs">{crumbs.map((c, i) => <span key={c.href}>{i > 0 && " / "}<Link href={c.href}>{c.label}</Link></span>)}</div> : null}
        <div className="title-row"><h1>{title}</h1>{typeof sub === "string" ? <Hint text={sub} /> : null}</div>
        {sub && typeof sub !== "string" ? <div className="meta">{sub}</div> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return <div className={`flash ${error ? "error" : "ok"}`} role="status">{error ?? ok}</div>;
}

export function Card({ title, sub, actions, children, tight, id, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tight?: boolean; id?: string; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`} id={id}>
      {title || actions ? <div className="card-h"><div className="title-row"><h2>{title}</h2>{typeof sub === "string" ? <Hint text={sub} /> : sub ? <span className="sub">{sub}</span> : null}</div>{actions ? <div className="actions">{actions}</div> : null}</div> : null}
      <div className={`card-b${tight ? " tight" : ""}`}>{children}</div>
    </section>
  );
}

export function Stat({ k, v, d, href, hint }: { k: string; v: ReactNode; d?: ReactNode; href?: string; hint?: string }) {
  const inner = <><div className="k">{k}{hint ? <Hint text={hint} /> : null}</div><div className="v">{v}</div>{d ? <div className="d">{d}</div> : null}</>;
  return href ? <Link href={href} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="e-t">{title}</div>{children ? <div className="e-d">{children}</div> : null}{action}</div>;
}

export function Bars({ rows, empty = "No data yet" }: { rows: { label: string; n: number; href?: string }[]; empty?: string }) {
  if (!rows.length) return <div className="muted small">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="lbl" title={r.label}>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.n / max) * 100}%`, display: "block" }} /></span>
          <span className="n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

type Tone = "good" | "warn" | "bad" | "info" | "sim" | "outline" | "demo" | "";
export function Badge({ children, tone = "" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  verified: "good", qualified: "good", active_opportunity: "good", won: "good", research_completed: "info", under_research: "info",
  new: "outline", lost: "bad", cancelled: "bad", on_hold: "warn",
  completed: "good", running: "info", queued: "outline", awaiting_approval: "warn", failed: "bad", retrying: "warn", skipped: "outline",
  pending: "warn", approved: "good", rejected: "bad", open: "outline", in_progress: "info", waiting: "warn", done: "good",
  needs_verification: "warn", saved: "good", partially_verified: "info", unverified: "outline",
  confirmed: "good", reported: "info", inferred: "sim", unknown: "outline",
  urgent: "bad", high: "warn", medium: "", low: "outline",
  disqualified: "bad", qualifying: "info", unqualified: "outline", proposal: "info", negotiation: "info",
};
export function StatusBadge({ value, opts }: { value: string | null | undefined; opts: C.Option[] }) {
  return <Badge tone={STATUS_TONE[value ?? ""] ?? ""}>{C.label(opts, value)}</Badge>;
}
export function InfoBadge({ value }: { value: string | null | undefined }) {
  const short: Record<string, string> = { confirmed: "Confirmed", reported: "Reported · unverified", inferred: "Inference", unknown: "Unknown" };
  return <Badge tone={STATUS_TONE[value ?? "unknown"]}>{short[value ?? "unknown"] ?? value}</Badge>;
}
export function Demo({ on }: { on?: boolean | null }) { return on ? <Badge tone="demo">Demo</Badge> : null; }
export function Sim({ on }: { on?: boolean | null }) { return on ? <span className="row" style={{ gap: 4, display: "inline-flex" }}><Badge tone="sim">Simulated</Badge><Hint text="An external integration (web search, email, social) is not connected, so this step made no outside call. Nothing simulated is saved as real research." /></span> : null; }
export function Score({ value }: { value: number | null | undefined }) {
  const b = scoreBand(value);
  return <Badge tone={b.tone === "muted" ? "outline" : b.tone}>{value ?? "–"}{value != null ? ` · ${b.label}` : ""}</Badge>;
}

export function Val({ v, unknown = "Unknown" }: { v: ReactNode; unknown?: string }) {
  if (v === null || v === undefined || v === "" || v === "unknown") return <span className="unknown">{unknown}</span>;
  return <>{v}</>;
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Dubai" });
}
export function fmtMoney(v: string | number | null | undefined, cur?: string | null) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return `${cur ?? "AED"} ${n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
export function ago(d: Date | string | null | undefined) {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function DeleteForm({ action, label = "Delete", back }: { action: (fd: FormData) => Promise<void>; label?: string; back?: string }) {
  return (
    <details>
      <summary className="btn danger sm" style={{ listStyle: "none" }}><Icon name="trash" />{label}</summary>
      <form action={action} className="row" style={{ marginTop: 8 }}>
        {back ? <input type="hidden" name="_back" value={back} /> : null}
        <label className="check small"><input type="checkbox" name="confirm" required /> Confirm permanent delete</label>
        <button className="btn danger sm" type="submit">Delete</button>
      </form>
    </details>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return <nav className="tabs">{items.map((t) => <Link key={t.href} href={t.href} className={t.label === active ? "active" : ""}>{t.label}{t.count ? ` (${t.count})` : ""}</Link>)}</nav>;
}

/** Tabs that join related pages into one section (Network, Agenda, Automation). */
const SECTIONS: Record<string, { href: string; label: string }[]> = {
  network: [{ href: "/companies", label: "Companies" }, { href: "/contacts", label: "Contacts" }],
  agenda: [{ href: "/agenda", label: "Calendar" }, { href: "/tasks", label: "Tasks & follow-ups" }, { href: "/activities", label: "Activity log" }],
  automation: [{ href: "/agents", label: "Agents" }, { href: "/automations", label: "Workflows" }],
};
export function SectionTabs({ section, active }: { section: keyof typeof SECTIONS; active: string }) {
  return <Tabs items={SECTIONS[section]} active={active} />;
}
