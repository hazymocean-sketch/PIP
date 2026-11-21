import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { saveStages, saveVenture } from "@/server/actions";
import { Submit } from "@/components/client";
import { Badge, Card, Flash } from "@/components/ui";

type V = typeof S.ventures.$inferSelect;
function VentureFields({ v }: { v?: V }) {
  return <div className="fields">
    <div className="field"><label>Name</label><input name="name" defaultValue={v?.name} required /></div>
    <div className="field"><label>Short description</label><input name="description" defaultValue={v?.description ?? ""} /></div>
    <div className="field wide"><label>Services (agents match discoveries against this)</label><textarea name="services" defaultValue={v?.services ?? ""} /></div>
    <div className="field wide"><label>Target clients</label><textarea name="targetClients" defaultValue={v?.targetClients ?? ""} /></div>
    <div className="field wide"><label>Acquisition strategy</label><textarea name="acquisitionStrategy" defaultValue={v?.acquisitionStrategy ?? ""} /></div>
    <div className="field wide"><label>Qualification criteria</label><textarea name="qualificationCriteria" defaultValue={v?.qualificationCriteria ?? ""} /></div>
    <div className="field wide"><label>Venture-specific agent instructions</label><textarea name="agentInstructions" defaultValue={v?.agentInstructions ?? ""} /></div>
    <label className="check"><input type="checkbox" name="servicesConfirmed" defaultChecked={v?.servicesConfirmed ?? false} /> Services confirmed (enables automatic routing)</label>
    <label className="check"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> Active</label>
  </div>;
}

export default async function Ventures({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ventures = await db.select().from(S.ventures).orderBy(asc(S.ventures.sortOrder));
  const stages = await db.select().from(S.pipelineStages).orderBy(asc(S.pipelineStages.sortOrder));
  return (<>
    <Flash sp={sp} />
    <p className="muted" style={{ marginBottom: 14 }}>Each venture has its own services, clients, acquisition strategy, qualification criteria, agent instructions and pipeline. Agents read these to understand how the ventures differ.</p>
    <div className="stack">
      {ventures.map((v) => (
        <Card key={v.id} title={<>{v.name} {!v.servicesConfirmed ? <Badge tone="warn">services to confirm</Badge> : null} {!v.active ? <Badge tone="outline">inactive</Badge> : null}</>} sub={v.description ?? undefined}>
          <details><summary>Edit venture profile</summary>
            <form action={saveVenture.bind(null, v.id)} style={{ marginTop: 10 }}><VentureFields v={v} /><div className="form-foot"><Submit>Save {v.name}</Submit></div></form></details>
          <details style={{ marginTop: 8 }}><summary>Pipeline stages ({stages.filter((s) => s.ventureId === v.id).map((s) => s.name).join(" → ")})</summary>
            <form action={saveStages.bind(null, v.id)} style={{ marginTop: 10 }} className="stack"><textarea name="stages" defaultValue={stages.filter((s) => s.ventureId === v.id).map((s) => s.name).join("\n")} style={{ minHeight: 160 }} /><span className="help">One stage per line, in order. “Won” and “Lost” are treated as closed.</span><Submit className="btn sm">Save stages</Submit></form></details>
        </Card>))}
      <Card title="Add a venture"><form action={saveVenture.bind(null, null)}><VentureFields /><div className="form-foot"><Submit>Add venture</Submit></div></form></Card>
    </div>
  </>);
}
