import { asc } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { saveScoringWeights, saveSectors } from "@/server/actions";
import { Submit } from "@/components/client";
import { Card, Flash } from "@/components/ui";

export default async function ResearchSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sectors = await db.select().from(S.sectors).orderBy(asc(S.sectors.sortOrder));
  const parents = sectors.filter((s) => !s.parentId);
  const factors = await db.select().from(S.scoringFactors).orderBy(asc(S.scoringFactors.sortOrder));
  return (<>
    <Flash sp={sp} />
    <div className="grid g2">
      <Card title="Sectors" sub="Research automation is enabled per sector. The pilot is Hotels & resorts.">
        <form action={saveSectors} className="stack" style={{ gap: 6 }}>
          {parents.map((p) => <div key={p.id}><label className="check"><input type="checkbox" name="researchEnabled" value={p.id} defaultChecked={p.researchEnabled} /> <strong>{p.name}</strong></label>
            <div className="muted small" style={{ paddingLeft: 23 }}>{sectors.filter((s) => s.parentId === p.id).map((s) => s.name).join(" · ") || "No sub-sectors"}</div></div>)}
          <hr className="sep" />
          <div className="row"><input name="newSector" placeholder="Add sector or sub-sector" style={{ flex: 1 }} /><select name="newSectorParent" style={{ width: "auto" }}><option value="">Top level</option>{parents.map((p) => <option key={p.id} value={p.id}>under {p.name}</option>)}</select></div>
          <Submit className="btn sm">Save sectors</Submit>
        </form>
      </Card>
      <Card title="Opportunity scoring methodology" sub="Each factor is rated 0–5 per project, multiplied by its weight, normalised to 100.">
        <form action={saveScoringWeights} className="stack" style={{ gap: 10 }}>
          {factors.map((f) => <div key={f.id} className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}><div className="small"><strong>{f.label}</strong></div><input name={`d_${f.key}`} defaultValue={f.description ?? ""} style={{ fontSize: 12, marginTop: 4 }} /></div>
            <div className="field" style={{ width: 80 }}><label className="small">Weight</label><input type="number" min={0} max={10} name={`w_${f.key}`} defaultValue={f.weight} /></div></div>)}
          <Submit className="btn sm">Save methodology</Submit>
        </form>
      </Card>
    </div>
  </>);
}
