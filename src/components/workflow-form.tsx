import Link from "next/link";
import * as C from "@/lib/constants";
import type { workflows } from "@/db/schema";
import { saveWorkflow } from "@/server/actions";
import { Submit } from "./client";

type WF = typeof workflows.$inferSelect;
const STEP_HELP = `Step types (JSON array of {"type", "config"}):
  condition          {"field":"priority","op":"in","value":["high","urgent"]}  → stops run if false
  create_task        {"title":"Follow up {{entity.title}}","dueInDays":3,"priority":"high"}
  schedule_follow_up {"title":"…","daysFromNow":3}   (also sets opportunity follow-up date)
  notify / escalate  {"title":"…","body":"…"}         (escalate = critical + urgent task)
  request_approval   {"title":"Approve …","risk":"high"}  → pauses until you decide
  run_agent          {"agentKey":"research","instruction":"…"}
  update_field       {"field":"status","value":"under_research"}  (assist mode → approval)
Templates: {{entity.name}}, {{entity.title}}, {{today}}
Condition ops: eq, neq, in, gte, lte, contains, exists, not_exists`;

export function WorkflowForm({ wf, ventures }: { wf?: WF; ventures: { id: string; name: string }[] }) {
  return (
    <form action={saveWorkflow.bind(null, wf?.id ?? null)} className="card"><div className="card-b">
      <div className="fields">
        <div className="field wide"><label>Name</label><input name="name" defaultValue={wf?.name} required /></div>
        <div className="field wide"><label>Description</label><input name="description" defaultValue={wf?.description ?? ""} /></div>
        <div className="field"><label>Venture</label><select name="ventureId" defaultValue={wf?.ventureId ?? ""}><option value="">All ventures</option>{ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
        <div className="field"><label>Mode</label><select name="mode" defaultValue={wf?.mode ?? "assist"}>{C.AUTONOMY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
        <div className="field"><label>Trigger</label><select name="triggerType" defaultValue={wf?.triggerType ?? "manual"}><option value="manual">Manual</option><option value="event">Event</option><option value="schedule">Schedule</option></select></div>
        <div className="field"><label>Event (if event trigger)</label><select name="eventType" defaultValue={wf?.eventType ?? "project.created"}>{C.EVENT_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
        <div className="field"><label>Schedule: every</label><select name="every" defaultValue={wf?.schedule?.every ?? "day"}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week</option></select></div>
        <div className="field"><label>At (HH:MM, Dubai) · weekday 0–6 for weekly</label><div className="row"><input name="at" defaultValue={wf?.schedule?.at ?? "08:00"} style={{ width: 100 }} /><input name="weekday" type="number" min={0} max={6} defaultValue={wf?.schedule?.weekday ?? 1} style={{ width: 80 }} /></div></div>
        <div className="field"><label>Max retries on failure</label><input name="maxRetries" type="number" min={0} max={10} defaultValue={wf?.maxRetries ?? 2} /></div>
        <div className="field"><label className="check" style={{ marginTop: 22 }}><input type="checkbox" name="enabled" defaultChecked={wf?.enabled ?? false} /> Enabled</label></div>
        <div className="field wide"><label>Conditions (JSON, all must match the triggering record)</label><textarea name="conditions" className="mono" defaultValue={JSON.stringify(wf?.conditions ?? [], null, 2)} /></div>
        <div className="field wide"><label>Steps (JSON)</label><textarea name="steps" className="mono" style={{ minHeight: 200, fontFamily: "var(--mono)", fontSize: 12 }} defaultValue={JSON.stringify(wf?.steps ?? [{ type: "notify", config: { title: "Hello from {{workflow.name}}" } }], null, 2)} /></div>
      </div>
      <details style={{ marginTop: 12 }}><summary>Step reference</summary><pre className="json">{STEP_HELP}</pre></details>
      <div className="form-foot"><Link className="btn ghost" href={wf ? `/automations/${wf.id}` : "/automations"}>Cancel</Link><Submit>Save workflow</Submit></div>
    </div></form>
  );
}
