"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";

export function Submit({ children, className = "btn primary", pendingText = "Working…", name, value }: { children: React.ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} name={name} value={value}>{pending ? pendingText : children}</button>;
}

export function NavLink({ href, children, count, alert }: { href: string; children: React.ReactNode; count?: number; alert?: boolean }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  return (
    <Link href={href} className={active ? "active" : ""} onClick={() => { const t = document.getElementById("nav-toggle") as HTMLInputElement | null; if (t) t.checked = false; }}>
      <span>{children}</span>
      {count ? <span className={`count${alert ? " alert" : ""}`}>{count}</span> : null}
    </Link>
  );
}
