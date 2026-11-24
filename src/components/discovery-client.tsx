"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

/** Submit button that asks for confirmation first. */
export function ConfirmButton({ children, message, className = "btn danger sm", form, disabled }: { children: React.ReactNode; message: string; className?: string; form?: string; disabled?: boolean }) {
  return <button type="submit" form={form} className={className} disabled={disabled} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}

/** Select-all + "Delete selected" bar for the Discover list. */
export function BulkBar({ formId }: { formId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const f = document.getElementById(formId) as HTMLFormElement | null;
    if (!f) return;
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name=id][form=${formId}]`));
    const update = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);
  const toggle = (on: boolean) => {
    document.querySelectorAll<HTMLInputElement>(`input[name=id][form=${formId}]`).forEach((b) => { b.checked = on; });
    setN(on ? document.querySelectorAll(`input[name=id][form=${formId}]`).length : 0);
  };
  return (
    <div className="bulk-bar">
      <label className="check small"><input type="checkbox" aria-label="Select all" onChange={(e) => toggle(e.currentTarget.checked)} /> Select all</label>
      <span className="muted small">{n ? `${n} selected` : "Tick discoveries to delete several at once"}</span>
      <ConfirmButton form={formId} disabled={!n} message={`Delete ${n} discover${n === 1 ? "y" : "ies"}? Saved ones are always kept.`}><Icon name="trash" />Delete selected</ConfirmButton>
    </div>
  );
}

/** Dropdown that filters the list to one search run. */
export function RunPicker({ runs, value, status }: { runs: { id: string; label: string }[]; value: string | null; status: string }) {
  const router = useRouter();
  return (
    <select aria-label="Filter by search" value={value ?? ""} onChange={(e) => {
      const p = new URLSearchParams(); if (status !== "review") p.set("status", status); if (e.target.value) p.set("run", e.target.value);
      router.push(`/discoveries${p.toString() ? `?${p}` : ""}`);
    }}>
      <option value="">All searches</option>
      {runs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
  );
}

/** ← / → keys move between discoveries (ignored while typing). */
export function KeyNav({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" && next) router.push(next);
      if (e.key === "ArrowLeft" && prev) router.push(prev);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [prev, next, router]);
  return null;
}
