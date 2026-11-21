import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NavLink } from "@/components/client";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

async function counts() {
  const r = await db.execute(sql`select
    (select count(*) from approvals where status = 'pending')::int as approvals,
    (select count(*) from discoveries where status in ('new','needs_verification'))::int as discoveries,
    (select count(*) from tasks where due_date < current_date and status in ('open','in_progress'))::int as overdue,
    (select count(*) from notifications where read_at is null)::int as unread,
    (select count(*) from agent_runs where status in ('running','awaiting_approval'))::int as active_runs`);
  return r.rows[0] as Record<string, number>;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const c = await counts();
  return (
    <>
      <input type="checkbox" id="nav-toggle" hidden />
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">PIP</div>
            <div><div className="brand-name">Projects Intelligence</div><div className="brand-sub">UAE · GCC</div></div>
          </div>
          <nav className="nav">
            <NavLink href="/command" count={c.approvals + c.unread} alert={c.approvals > 0}>AI Command Centre</NavLink>
            <NavLink href="/">Overview</NavLink>
            <div className="nav-group">Intelligence</div>
            <NavLink href="/news">News &amp; Updates</NavLink>
            <NavLink href="/discoveries" count={c.discoveries}>Discoveries</NavLink>
            <NavLink href="/research">Research Center</NavLink>
            <div className="nav-group">Pipeline</div>
            <NavLink href="/projects">Projects</NavLink>
            <NavLink href="/opportunities">Opportunities</NavLink>
            <NavLink href="/companies">Companies</NavLink>
            <NavLink href="/contacts">Contacts</NavLink>
            <div className="nav-group">Execution</div>
            <NavLink href="/activities">Meetings &amp; Activities</NavLink>
            <NavLink href="/tasks" count={c.overdue} alert={c.overdue > 0}>Tasks &amp; Follow-ups</NavLink>
            <div className="nav-group">Automation</div>
            <NavLink href="/agents" count={c.active_runs}>Agents</NavLink>
            <NavLink href="/automations">Workflows</NavLink>
            <div className="nav-group">Insight</div>
            <NavLink href="/reports">Reports &amp; Analytics</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
          <div className="sidebar-foot">
            <span title={user.email}>{user.name}</span>
            <form action="/api/auth/logout" method="post"><button className="btn ghost sm" type="submit">Sign out</button></form>
          </div>
        </aside>
        <div className="main">
          <div className="topbar"><label htmlFor="nav-toggle" aria-label="Open navigation">☰</label><strong>PIP</strong></div>
          <main className="content">{children}</main>
        </div>
      </div>
    </>
  );
}
