import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { createResearchSession } from "@/server/actions";
import { refOptions } from "@/server/entities";
import { integrationStatus } from "@/server/ai/providers";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Empty, Flash, PageHead, StatusBadge, fmtDate } from "@/components/ui";

export const metadata = { title: "Research Center" };
export default async function Research({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const rows = (await db.execute(sql`select r.*, p.name as project, c.name as company, (select count(*) from discoveries d where d.research_session_id = r.id)::int as found,
    (select count(*) from sources s where s.research_session_id = r.id)::int as srcs from research_sessions r left join projects p on p.id = r.project_id left join companies c on c.id = r.company_id
    ${sp.kind ? sql`where r.kind = ${sp.kind}` : sql``} order by r.updated_at desc limit 300`)).rows as any[];
  const [projects, companies] = await Promise.all([refOptions("projects"), refOptions("companies")]);
  const integ = integrationStatus().filter((i) => i.category === "search" || i.category === "ai");
  return (<>
    <PageHead title="Research Center" sub="Structured research linked to records. Each finding is marked confirmed, reported, inferred or unknown." />
    <Flash sp={sp} />
    <div className="grid g2" style={{ marginBottom: 14 }}>
      <Card title="Start research">
        <form action={createResearchSession} className="stack" style={{ gap: 10 }}>
          <div className="fields">
            <div className="field"><label>Research type</label><select name="kind">{C.RESEARCH_KIND.filter((k) => k.value !== "discovery").map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
            <div className="field"><label>Title (optional)</label><input name="title" placeholder="Auto-generated if blank" /></div>
            <div className="field"><label>Project</label><select name="projectId"><option value="">—</option>{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="field"><label>Company / developer</label><select name="companyId"><option value="">—</option>{companies.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="field wide"><label>Question / announcement to investigate</label><textarea name="query" placeholder="e.g. Has the operator for X been confirmed? Paste the announcement text or URL." /></div>
          </div>
          <div className="row"><Submit>Open research session</Submit></div>
        </form>
      </Card>
      <Card title="Research engine status">
        <div className="stack" style={{ gap: 8 }}>
          {integ.map((i) => <div key={i.key} className="row" style={{ justifyContent: "space-between" }}><span>{i.label}</span><Badge tone={i.connected ? "good" : "outline"}>{i.connected ? "Connected · untested" : "Not connected"}</Badge></div>)}
          <p className="muted small" style={{ marginTop: 6 }}>Research works fully in manual mode: templates, checklists, source capture and linking. Connecting a search and AI provider (Settings → Integrations) adds automated searching and summaries — clearly labelled as AI output.</p>
        </div>
      </Card>
    </div>
    <Card tight title="Research sessions">{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Session</th><th>Type</th><th>Linked to</th><th>Provider</th><th>Found</th><th>Sources</th><th>Status</th><th>Updated</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td><Link className="title" href={`/research/${r.id}`}>{r.title}</Link> <Demo on={r.is_demo} />{r.agent_run_id ? <> <Badge tone="info">agent</Badge></> : null}</td><td className="small">{C.label(C.RESEARCH_KIND, r.kind)}</td>
        <td className="small">{r.project ? <Link className="link" href={`/projects/${r.project_id}`}>{r.project}</Link> : r.company ? <Link className="link" href={`/companies/${r.company_id}`}>{r.company}</Link> : <span className="faint">—</span>}</td>
        <td className="small">{r.provider}</td><td className="num">{r.found}</td><td className="num">{r.srcs}</td><td><StatusBadge value={r.status === "open" ? "in_progress" : r.status} opts={[...C.TASK_STATUS, ...C.RUN_STATUS]} /></td><td className="small muted">{fmtDate(r.updated_at)}</td></tr>)}
    </tbody></table></div> : <Empty title="No research sessions yet" />}</Card>
  </>);
}
