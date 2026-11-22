import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { completeTask } from "@/server/actions";
import { Badge, Card, Demo, Empty, Flash, PageHead, SectionTabs, StatusBadge, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Tasks & Follow-ups" };
export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const where = view === "overdue" ? sql`t.due_date < current_date and t.status in ('open','in_progress')`
    : view === "week" ? sql`t.due_date <= current_date + 7 and t.status in ('open','in_progress','waiting')`
    : view === "done" ? sql`t.status in ('done','cancelled')` : view === "all" ? sql`true` : sql`t.status in ('open','in_progress','waiting')`;
  const rows = (await db.execute(sql`select t.*, p.name as project, o.title as opp, c.name as company, k.full_name as contact, a.name as agent from tasks t
    left join projects p on p.id = t.project_id left join opportunities o on o.id = t.opportunity_id left join companies c on c.id = t.company_id
    left join contacts k on k.id = t.contact_id left join agents a on a.id = t.created_by_agent_id
    where ${where} order by (t.due_date is null), t.due_date, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end limit 500`)).rows as any[];
  const counts = (await db.execute(sql`select count(*) filter (where due_date < current_date and status in ('open','in_progress'))::int as overdue,
    count(*) filter (where status in ('open','in_progress','waiting'))::int as open from tasks`)).rows[0] as any;
  const today = new Date().toISOString().slice(0, 10);
  return (<>
    <PageHead title="Agenda" sub="Your tasks and follow-ups, plus the log of meetings, calls and site visits. Tasks created by agents or workflows are tagged." actions={<Link className="btn primary" href="/tasks/new">New task</Link>} />
    <SectionTabs section="agenda" active="Tasks & follow-ups" />
    <Flash sp={sp} />
    <Tabs active={{ open: "Open", overdue: "Overdue", week: "Due in 7 days", done: "Done", all: "All" }[view] ?? "Open"} items={[
      { href: "/tasks", label: "Open", count: counts.open }, { href: "/tasks?view=overdue", label: "Overdue", count: counts.overdue },
      { href: "/tasks?view=week", label: "Due in 7 days" }, { href: "/tasks?view=done", label: "Done" }, { href: "/tasks?view=all", label: "All" }]} />
    <Card tight>{rows.length ? <div className="table-wrap"><table className="t"><thead><tr><th>Task</th><th>Related to</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map((t) => <tr key={t.id}>
        <td><Link className="title" href={`/tasks/${t.id}/edit`}>{t.title}</Link> <Demo on={t.is_demo} />{t.agent ? <> <Badge tone="info">{t.agent.replace(" Agent", "")}</Badge></> : null}{t.workflow_run_id ? <> <Badge tone="info">workflow</Badge></> : null}</td>
        <td className="small">{[t.project && <Link key="p" className="link" href={`/projects/${t.project_id}`}>{t.project}</Link>, t.opp && <Link key="o" className="link" href={`/opportunities/${t.opportunity_id}`}>{t.opp}</Link>, t.company, t.contact].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</td>
        <td><StatusBadge value={t.priority} opts={C.PRIORITY} /></td>
        <td className="nowrap small" style={{ color: t.due_date && t.due_date < today && !["done", "cancelled"].includes(t.status) ? "var(--red)" : undefined }}>{fmtDate(t.due_date) ?? <span className="faint">—</span>}</td>
        <td><StatusBadge value={t.status} opts={C.TASK_STATUS} /></td>
        <td>{!["done", "cancelled"].includes(t.status) ? <form action={completeTask.bind(null, t.id, `/tasks${view !== "open" ? `?view=${view}` : ""}`)}><button className="btn ghost sm">Done</button></form> : null}</td></tr>)}
    </tbody></table></div> : <Empty title="Nothing here" action={<Link className="btn primary" href="/tasks/new">Add task</Link>} />}</Card>
  </>);
}
