"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Submit({ children, className = "btn primary", pendingText = "Working…", name, value }: { children: React.ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} name={name} value={value}>{pending ? pendingText : children}</button>;
}

/** Nav link. `match` lists extra path prefixes that should also mark it active (consolidated sections). */
export function NavLink({ href, children, count, alert, match = [] }: { href: string; children: React.ReactNode; count?: number; alert?: boolean; match?: string[] }) {
  const path = usePathname();
  const prefixes = [href, ...match];
  const active = href === "/" ? path === "/" : prefixes.some((p) => path === p || path.startsWith(p + "/"));
  return (
    <Link href={href} className={active ? "active" : ""} onClick={() => { const t = document.getElementById("nav-toggle") as HTMLInputElement | null; if (t) t.checked = false; }}>
      <span>{children}</span>
      {count ? <span className={`count${alert ? " alert" : ""}`}>{count}</span> : null}
    </Link>
  );
}

/** Small "i" icon. Hover or focus shows a rectangular note bubble, positioned so it never gets clipped. */
export function Hint({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
    const above = r.top > 120;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left });
    ref.current?.setAttribute("data-above", String(above));
  };
  const above = ref.current?.getAttribute("data-above") === "true";
  return (
    <span ref={ref} className="hint" tabIndex={0} role="button" aria-label={text}
      onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); pos ? setPos(null) : show(); }}>
      i
      {pos && typeof document !== "undefined" ? createPortal(<span className="hint-bubble" role="tooltip" style={{ top: pos.top, left: pos.left, width: "max-content", maxWidth: Math.min(280, window.innerWidth - 24), transform: above ? "translateY(-100%)" : undefined }}>{text}</span>, document.body) : null}
    </span>
  );
}

/** Dark / light switch. Stored in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);
  const set = (t: "dark" | "light") => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `pip_theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button type="button" aria-pressed={theme === "dark"} onClick={() => set("dark")}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" /></svg>Dark</button>
      <button type="button" aria-pressed={theme === "light"} onClick={() => set("light")}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>Light</button>
    </div>
  );
}
