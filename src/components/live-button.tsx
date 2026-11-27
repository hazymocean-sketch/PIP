"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** The "on air" switch: Go live → Researching → Live (blinking red). Click Live to take it off air. */
export function LiveButton({ projectId, live, researching, name }: { projectId: string; live: boolean; researching: boolean; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "live" | "research" | "off">(researching ? "research" : null);
  const post = (path: string, body?: object) => fetch(`/api/projects/${projectId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

  async function click() {
    if (busy) return;
    if (live) {
      if (!window.confirm(`Take “${name}” off air? Its open deals are put on hold in the CRM (Go live resumes them).`)) return;
      setBusy("off"); await post("live", { on: false }); setBusy(null); router.refresh(); return;
    }
    setBusy("live");
    const r = await post("live", { on: true });
    router.refresh();
    if (r.research) { setBusy("research"); await post("research"); }
    setBusy(null); router.refresh();
  }

  const state = busy === "research" || busy === "live" ? "busy" : live ? "live" : "off";
  const text = busy === "research" ? "Researching" : busy === "live" ? "Going live" : busy === "off" ? "Stopping" : live ? "Live" : "Go live";
  const title = live ? "You're working this project. Click to take it off air." : "Mark as live: opens a deal per venture in the CRM and researches the project.";
  return <button type="button" className={`onair ${state}`} onClick={click} disabled={!!busy} title={title} aria-pressed={live}><i />{text}</button>;
}

/** Re-run research on a live project. */
export function ResearchAgain({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="link-btn" disabled={busy} onClick={async () => {
    setBusy(true); router.refresh();
    await fetch(`/api/projects/${projectId}/research`, { method: "POST" }); setBusy(false); router.refresh();
  }}>{busy ? "Researching…" : "Research again"}</button>;
}
