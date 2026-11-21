"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const ITEMS = [["/settings", "Profile & security"], ["/settings/ventures", "Business ventures"], ["/settings/research", "Research & scoring"], ["/settings/integrations", "Integrations"], ["/settings/data", "Data, export & backup"]];
export function SettingsTabs() {
  const p = usePathname();
  return <nav className="tabs">{ITEMS.map(([h, l]) => <Link key={h} href={h} className={p === h ? "active" : ""}>{l}</Link>)}</nav>;
}
