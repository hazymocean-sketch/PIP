import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { tickNow } from "@/server/actions";
import { Submit } from "@/components/client";
import { Badge, Card, Demo, Empty, Flash, PageHead, SectionTabs, fmtDate, ago } from "@/components/ui";

export const metadata = { title: "Automation" };
export default async function Automations({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const rows = (await db.execute(sql`select w.*, v.name as venture, (select count(*) from workflow_runs r where r.workflow_id = w.id)::int as runs,
    (select max(created_at) from workflow_runs r where r.workflow_id = w.id) as last_run,
    (select count(*) from workflow_runs r where r.workflow_id = w.id and r.status = 'failed')::int as failed
    from workflows w left join ventures v on v.id = w.venture_id order by w.enabled desc, w.name`)).rows as any[];
  const cron = !!process.env.CRON_SECRET;
  return (<>
    <PageHead title="Automation" sub={`Workflows run on a schedule, when something happens (an event), or manually. Events run instantly; schedules and retries run on each "tick" — ${cron ? "the scheduler is configured." : "set CRON_SECRET + Vercel Cron in production, or use Run tick now."} Templates start disabled.`}
      actions={<><form action={tickNow}><Submit className="btn" pendingText="Running…">Run tick now</Submit></form><Link className="btn primary" href="/automations/new">New workflow</Link></>} />
    <SectionTabs section="automation" active="Workflows" />
    <Flash sp={sp} />
    <Card tight>{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Workflow</th><th>Trigger</th><th>Mode</th><th>Venture</th><th>Steps</th><th>Runs</th><th>Last run</th><th>Status</th></tr></thead><tbody>
      {rows.map((w) => <tr key={w.id}><td><Link className="title" href={`/automations/${w.id}`}>{w.name}</Link> <Demo on={w.is_demo} /><div className="muted small">{w.description}</div></td>
        <td className="small">{w.trigger_type === "event" ? `On ${C.label(C.EVENT_TYPES, w.event_type)}` : w.trigger_type === "schedule" ? `Every ${w.schedule?.every}${w.schedule?.at ? ` at ${w.schedule.at}` : ""}${w.next_run_at ? ` · next ${fmtDate(w.next_run_at, true)}` : ""}` : "Manual"}</td>
        <td><Badge tone="outline">{w.mode}</Badge></td><td className="small">{w.venture ?? "All"}</td><td className="num">{(w.steps as unknown[]).length}</td>
        <td className="num">{w.runs}{w.failed ? <span style={{ color: "var(--red)" }}> ({w.failed} failed)</span> : null}</td><td className="small muted">{w.last_run ? ago(w.last_run) : "never"}</td>
        <td>{w.enabled ? <Badge tone="good">Enabled</Badge> : <Badge tone="outline">Disabled</Badge>}</td></tr>)}
    </tbody></table></div> : <Empty title="No workflows" />}</Card>
  </>);
}
