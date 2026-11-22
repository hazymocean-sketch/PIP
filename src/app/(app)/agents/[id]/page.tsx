import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import * as C from "@/lib/constants";
import { runAgentAction, updateAgent } from "@/server/actions";
import { toolList } from "@/server/agents/tools";
import { refOptions } from "@/server/entities";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Empty, Flash, Hint, PageHead, Sim, StatusBadge, ago } from "@/components/ui";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [a] = await db.select().from(S.agents).where(eq(S.agents.id, id));
  if (!a) notFound();
  const ventures = await db.select().from(S.ventures).orderBy(S.ventures.sortOrder);
  const scope = new Set((await db.select().from(S.agentVentures).where(eq(S.agentVentures.agentId, id))).map((x) => x.ventureId));
  const runs = await db.select().from(S.agentRuns).where(eq(S.agentRuns.agentId, id)).orderBy(desc(S.agentRuns.createdAt)).limit(25);
  const tools = toolList();
  const [projects, contacts, opps] = await Promise.all([refOptions("projects"), refOptions("contacts"), refOptions("opportunities")]);
  const target = a.key === "research" ? { type: "project", opts: projects } : a.key === "outreach" ? { type: "contact", opts: contacts } : null;
  return (<>
    <PageHead title={a.name} crumbs={[{ href: "/agents", label: "Agents" }]} sub={a.responsibility} />
    <Flash sp={sp} />
    <div className="split"><div className="stack">
      <Card title="Run this agent">
        <form action={runAgentAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="agentId" value={a.id} /><input type="hidden" name="_back" value={`/agents/${id}`} />
          <div className="fields">
            <div className="field wide"><label>Instruction</label><textarea name="instruction" placeholder={a.instructions ?? ""} style={{ minHeight: 56 }} /></div>
            <div className="field"><label>Venture</label><select name="ventureId"><option value="">Any / all</option>{ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            {target ? <div className="field"><label>Target {target.type}</label><input type="hidden" name="targetType" value={target.type} /><select name="targetId"><option value="">—</option>{target.opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div> : null}
            {a.key === "outreach" && opps.length ? <div className="field"><span className="help">To draft for an opportunity, use “Draft outreach” on the opportunity page.</span></div> : null}
          </div>
          <div className="row"><Submit pendingText="Running…">Run now</Submit><span className="muted small">Mode: {C.label(C.AUTONOMY_MODES, a.autonomyMode)}</span></div>
        </form>
      </Card>
      <Card title="Execution history" tight>
        {runs.length ? <div className="list">{runs.map((r) => <Link key={r.id} href={`/agents/runs/${r.id}`} className="li"><div className="grow"><div className="ttl small">{r.instruction} <Demo on={r.isDemo} /></div><div className="meta">{r.summary}</div><div className="meta">{r.triggeredBy} · {r.mode} · {r.planner} · {ago(r.createdAt)}</div></div><div className="stack" style={{ gap: 4, alignItems: "flex-end" }}><StatusBadge value={r.status} opts={C.RUN_STATUS} /><Sim on={r.isSimulated} /></div></Link>)}</div> : <Empty title="Never run" />}
      </Card>
    </div><div className="stack">
      <Card title="Configuration">
        <form action={updateAgent.bind(null, id)} className="stack" style={{ gap: 10 }}>
          <div className="field"><label>Name</label><input name="name" defaultValue={a.name} required /></div>
          <div className="field"><label>Responsibility</label><textarea name="responsibility" defaultValue={a.responsibility} required /></div>
          <div className="field"><label>Instructions</label><textarea name="instructions" defaultValue={a.instructions ?? ""} /></div>
          <div className="field"><label>Operating rules</label><textarea name="operatingRules" defaultValue={a.operatingRules ?? ""} style={{ minHeight: 100 }} /></div>
          <div className="field"><label>Autonomy mode</label><select name="autonomyMode" defaultValue={a.autonomyMode}>{C.AUTONOMY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          <div className="field"><label>External-action limit per run <Hint text="Only applies in Autonomous mode. 0 means every external action (email, posting) still needs your approval." /></label><input name="autonomyLimit" type="number" min={0} max={50} defaultValue={a.autonomyLimit} /></div>
          <span className="lbl-s">Permitted tools <Hint text="What this agent is allowed to use. External tools need an integration; tools marked ‘changes data’ follow the approval rules of the mode." /></span>
          {tools.map((t) => <label key={t.key} className="check small" title={t.description}><input type="checkbox" name="tools" value={t.key} defaultChecked={a.tools.includes(t.key)} /> {t.label} {t.kind === "external" ? <Badge tone="sim">external</Badge> : null}{t.consequential ? <Badge tone="outline">changes data</Badge> : null}</label>)}
          <span className="lbl-s" style={{ marginTop: 6 }}>Venture scope <Hint text="Limit the agent to specific ventures. Leave all unticked to let it work across every venture." /></span>
          {ventures.map((v) => <label key={v.id} className="check small"><input type="checkbox" name="ventureId" value={v.id} defaultChecked={scope.has(v.id)} /> {v.name}</label>)}
          <label className="check"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Enabled</label>
          <Submit>Save configuration</Submit>
        </form>
      </Card>
    </div></div>
  </>);
}
