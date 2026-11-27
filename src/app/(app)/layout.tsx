import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NavCollapse, NavLink, NavGroupLink, NavWatcher, ThemeToggle } from "@/components/client";
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
  const jar = await cookies();
  const theme = jar.get("pip_theme")?.value === "light" ? "light" : "dark";
  const collapsed = jar.get("pip_nav")?.value === "collapsed";
  return (
    <>
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" tabIndex={-1} />
      <NavWatcher />
      <div className={`shell${collapsed ? " nav-collapsed" : ""}`}>
        <aside className="sidebar" aria-label="Main navigation">
          <div className="brand">
            <div className="brand-mark">PIP</div>
            <div className="brand-text"><div className="brand-name">Projects Intelligence</div><div className="brand-sub">UAE · GCC</div></div>
            <NavCollapse initial={collapsed} />
            <label htmlFor="nav-toggle" className="nav-close" aria-label="Close menu">✕</label>
          </div>
          <nav className="nav">
            <NavLink href="/command" count={c.approvals} alert={c.approvals > 0}><Icon name="command" />Command</NavLink>
            <NavLink href="/" className="nav-today"><Icon name="today" />Today</NavLink>
            <div className="nav-group">Intelligence</div>
            <NavLink href="/discoveries" count={c.discoveries}><Icon name="discover" />Discover</NavLink>
            <NavLink href="/news"><Icon name="news" />News</NavLink>
            <NavLink href="/research"><Icon name="research" />Research</NavLink>
            <NavGroupLink href="/pipeline">Pipeline</NavGroupLink>
            <NavLink href="/projects"><Icon name="projects" />Projects</NavLink>
            <NavLink href="/opportunities"><Icon name="opportunities" />CRM</NavLink>
            <NavLink href="/companies" match={["/contacts"]}><Icon name="network" />Network</NavLink>
            <div className="nav-group">Execution</div>
            <NavLink href="/agenda" match={["/tasks", "/activities", "/meetings"]} count={c.overdue} alert={c.overdue > 0}><Icon name="agenda" />Agenda</NavLink>
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
          <div className="topbar"><label htmlFor="nav-toggle" aria-label="Open menu" className="nav-open"><span /><span /><span /></label><strong>PIP</strong></div>
          <main className="content">{children}</main>
        </div>
      </div>
      <label htmlFor="nav-toggle" className="nav-scrim" aria-label="Close menu" />
    </>
  );
}
