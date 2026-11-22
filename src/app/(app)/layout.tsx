import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NavLink, ThemeToggle } from "@/components/client";
import { Icon } from "@/components/icons";
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
  const [user, c] = await Promise.all([requireAdmin(), counts()]);
  const theme = (await cookies()).get("pip_theme")?.value === "light" ? "light" : "dark";
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
            <NavLink href="/command" count={c.approvals} alert={c.approvals > 0}><Icon name="command" />Command</NavLink>
            <NavLink href="/"><Icon name="today" />Today</NavLink>
            <div className="nav-group">Intelligence</div>
            <NavLink href="/discoveries" count={c.discoveries}><Icon name="discover" />Discover</NavLink>
            <NavLink href="/news"><Icon name="news" />News</NavLink>
            <NavLink href="/research"><Icon name="research" />Research</NavLink>
            <div className="nav-group">Pipeline</div>
            <NavLink href="/projects"><Icon name="projects" />Projects</NavLink>
            <NavLink href="/opportunities"><Icon name="opportunities" />Opportunities</NavLink>
            <NavLink href="/companies" match={["/contacts"]}><Icon name="network" />Network</NavLink>
            <div className="nav-group">Execution</div>
            <NavLink href="/tasks" match={["/activities"]} count={c.overdue} alert={c.overdue > 0}><Icon name="agenda" />Agenda</NavLink>
            <NavLink href="/agents" match={["/automations"]} count={c.active_runs}><Icon name="automation" />Automation</NavLink>
            <div className="nav-group">Insight</div>
            <NavLink href="/reports"><Icon name="reports" />Reports</NavLink>
            <NavLink href="/settings"><Icon name="settings" />Settings</NavLink>
          </nav>
          <div className="sidebar-foot">
            <ThemeToggle initial={theme} />
            <div className="row">
              <span title={user.email} style={{ fontWeight: 600 }}>{user.name}</span>
              <form action="/api/auth/logout" method="post"><button className="btn ghost sm icon-only" type="submit" title="Sign out" aria-label="Sign out"><Icon name="logout" /></button></form>
            </div>
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
