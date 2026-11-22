"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useRef, useState } from "react";

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
      {pos ? <span className="hint-bubble" role="tooltip" style={{ top: pos.top, left: pos.left, width: "max-content", maxWidth: Math.min(280, typeof window !== "undefined" ? window.innerWidth - 24 : 280), transform: above ? "translateY(-100%)" : undefined }}>{text}</span> : null}
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
      <button type="button" aria-pressed={theme === "dark"} onClick={() => set("dark")}>Dark</button>
      <button type="button" aria-pressed={theme === "light"} onClick={() => set("light")}>Light</button>
    </div>
  );
}
