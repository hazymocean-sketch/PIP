import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Bars, Card, Demo, Empty, Flash, PageHead, Stat, StatusBadge, Score, fmtDate, Badge } from "@/components/ui";
import * as C from "@/lib/constants";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const k = (await db.execute(sql`select
    (select count(*) from projects)::int as projects,
    (select count(*) from projects where is_demo)::int as demo,
    (select count(*) from discoveries where created_at > now() - interval '7 days')::int as new_disc,
    (select count(*) from discoveries where status in ('new','needs_verification'))::int as disc_review,
    (select count(*) from projects where status = 'under_research')::int as under_research,
    (select count(*) from projects where status in ('verified','qualified','active_opportunity','won'))::int as verified,
    (select count(*) from opportunities where qualification_status = 'qualified' and commercial_status not in ('won','lost'))::int as qualified,
    (select count(*) from approvals where status = 'pending')::int as approvals,
    (select count(*) from tasks where due_date < current_date and status in ('open','in_progress'))::int as overdue`)).rows[0] as Record<string, number>;

  const bySector = (await db.execute(sql`select coalesce(s.name, 'Unassigned') as label, count(*)::int as n from projects p left join sectors s on s.id = p.sector_id group by 1 order by 2 desc limit 8`)).rows as { label: string; n: number }[];
  const byLoc = (await db.execute(sql`select coalesce(nullif(city,''), 'Unknown') as label, count(*)::int as n from projects group by 1 order by 2 desc limit 8`)).rows as { label: string; n: number }[];
  const follow = (await db.execute(sql`
    select 'task' as kind, t.id, t.title, t.due_date as date, t.priority, t.is_demo from tasks t where t.status in ('open','in_progress') and t.due_date <= current_date + 14
    union all
    select 'opportunity', o.id, o.title, o.follow_up_date, o.priority, o.is_demo from opportunities o where o.follow_up_date <= current_date + 14 and o.commercial_status not in ('won','lost')
    order by date asc limit 10`)).rows as { kind: string; id: string; title: string; date: string; priority: string; is_demo: boolean }[];
  const news = (await db.execute(sql`select id, title, source_name, published_at, url, relevance, is_demo from news_items order by published_at desc nulls last, created_at desc limit 6`)).rows as any[];
  const hp = (await db.execute(sql`select o.id, o.title, o.priority, o.commercial_status, v.name as venture, p.opportunity_score, o.is_demo from opportunities o
    left join ventures v on v.id = o.venture_id left join projects p on p.id = o.project_id
    where o.priority in ('high','urgent') and o.commercial_status not in ('won','lost') order by o.priority = 'urgent' desc, p.opportunity_score desc nulls last limit 8`)).rows as any[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHead title="Overview" sub="Live summary of PIP's database. Every figure below is counted from actual records."
        actions={<><Link className="btn" href="/discoveries">Run discovery</Link><Link className="btn primary" href="/projects/new">New project</Link></>} />
      <Flash sp={sp} />
      {k.demo > 0 ? <div className="notice warn" style={{ marginBottom: 14 }}>Includes {k.demo} demo project(s), clearly marked DEMO. Remove them in Settings → Data.</div> : null}
      <div className="grid g6" style={{ marginBottom: 14 }}>
        <Stat k="Discovered projects" v={k.projects} href="/projects" />
        <Stat k="New discoveries (7d)" v={k.new_disc} d={`${k.disc_review} awaiting review`} href="/discoveries" />
        <Stat k="Under research" v={k.under_research} href="/projects?status=under_research" />
        <Stat k="Verified or better" v={k.verified} href="/projects?status=verified" />
        <Stat k="Qualified opportunities" v={k.qualified} href="/opportunities?qualification=qualified" />
        <Stat k="Pending approvals" v={k.approvals} d={k.overdue ? `${k.overdue} overdue tasks` : undefined} href="/command?tab=approvals" />
      </div>

      {k.projects === 0 ? (
        <Card><Empty title="No projects yet" action={<div className="row" style={{ justifyContent: "center" }}><Link className="btn primary" href="/discoveries">Start a hotels &amp; resorts discovery</Link><Link className="btn" href="/settings/data">Load demo data</Link></div>}>
          PIP starts empty on purpose — nothing here is decorative. Run a discovery, add a project manually, or load clearly-labelled demo data to explore the workflows.
        </Empty></Card>
      ) : null}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Projects by sector"><Bars rows={bySector.map((r) => ({ ...r }))} empty="No projects yet" /></Card>
        <Card title="Projects by location"><Bars rows={byLoc.map((r) => ({ ...r, href: r.label !== "Unknown" ? `/projects?city=${encodeURIComponent(r.label)}` : undefined }))} empty="No projects yet" /></Card>
        <Card title="Upcoming follow-ups" sub="Tasks and opportunity follow-ups due within 14 days" tight actions={<Link className="btn ghost sm" href="/tasks">All tasks</Link>}>
          {follow.length ? <div className="list">{follow.map((f) => (
            <Link key={f.kind + f.id} href={f.kind === "task" ? "/tasks" : `/opportunities/${f.id}`} className="li">
              <div className="grow"><div className="ttl">{f.title} <Demo on={f.is_demo} /></div><div className="meta">{f.kind === "task" ? "Task" : "Opportunity follow-up"} · {C.label(C.PRIORITY, f.priority)}</div></div>
              <Badge tone={f.date < today ? "bad" : f.date === today ? "warn" : "outline"}>{f.date < today ? "Overdue · " : ""}{fmtDate(f.date)}</Badge>
            </Link>))}</div> : <Empty title="Nothing due">Follow-ups and tasks with due dates appear here.</Empty>}
        </Card>
        <Card title="High-priority opportunities" tight actions={<Link className="btn ghost sm" href="/opportunities">Pipeline</Link>}>
          {hp.length ? <div className="list">{hp.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="li">
              <div className="grow"><div className="ttl">{o.title} <Demo on={o.is_demo} /></div><div className="meta">{o.venture ?? "No venture"} · {C.label(C.COMMERCIAL_STATUS, o.commercial_status)}</div></div>
              <StatusBadge value={o.priority} opts={C.PRIORITY} /> <Score value={o.opportunity_score} />
            </Link>))}</div> : <Empty title="No high-priority opportunities">Set priority to High or Urgent on an opportunity.</Empty>}
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="Recent news & updates" tight actions={<Link className="btn ghost sm" href="/news">All news</Link>}>
          {news.length ? <div className="list">{news.map((n) => (
            <div key={n.id} className="li">
              <div className="grow"><a className="ttl link" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> <Demo on={n.is_demo} /><div className="meta">{n.source_name ?? "Unknown source"} · {fmtDate(n.published_at) ?? "Date unknown"} · relevance {n.relevance}/5</div></div>
            </div>))}</div> : <Empty title="No news items yet">Add relevant announcements in News &amp; Updates — each one keeps its source, date and URL.</Empty>}
        </Card>
      </div>
    </>
  );
}
