import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth";
import { Bars, Card, Demo, Empty, Flash, Score, StatusBadge, fmtDate, Badge, Hint } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { KnobStat, dial } from "@/components/knob";
import * as C from "@/lib/constants";

export const metadata = { title: "Today" };

function dubaiNow() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }).format(now));
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(now);
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return { greeting, date };
}

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const first = user.name && user.name !== "Administrator" ? user.name.split(" ")[0] : null;
  const { greeting, date } = dubaiNow();


  type Item = { id: string; title: string; meta: string; href: string };
  const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows as Item[];
  const listKeys = ["approvals", "overdue", "today", "followups", "discoveries", "research"] as const;
  const listQueries = [
    /* approvals */ q(sql`select ap.id, ap.title, concat_ws(' · ', a.name, ap.risk_level || ' risk') as meta, '/command?tab=approvals' as href
      from approvals ap left join agents a on a.id = ap.agent_id where ap.status = 'pending' order by ap.created_at desc limit 6`),
    /* overdue */ q(sql`select t.id, t.title, concat('Due ', to_char(t.due_date, 'DD Mon'), coalesce(' · ' || p.name, ' · ' || o.title, '')) as meta,
      case when t.project_id is not null then '/projects/' || t.project_id when t.opportunity_id is not null then '/opportunities/' || t.opportunity_id else '/tasks/' || t.id || '/edit' end as href
      from tasks t left join projects p on p.id = t.project_id left join opportunities o on o.id = t.opportunity_id
      where t.due_date < current_date and t.status in ('open','in_progress') order by t.due_date limit 6`),
    /* today */ q(sql`select t.id, t.title, coalesce(p.name, o.title, initcap(t.priority) || ' priority') as meta,
      case when t.project_id is not null then '/projects/' || t.project_id when t.opportunity_id is not null then '/opportunities/' || t.opportunity_id else '/tasks/' || t.id || '/edit' end as href
      from tasks t left join projects p on p.id = t.project_id left join opportunities o on o.id = t.opportunity_id
      where t.due_date = current_date and t.status in ('open','in_progress','waiting') limit 6`),
    /* followups */ q(sql`select o.id, o.title, concat('Follow-up ', to_char(o.follow_up_date, 'DD Mon'), coalesce(' · ' || v.name, '')) as meta, '/opportunities/' || o.id as href
      from opportunities o left join ventures v on v.id = o.venture_id where o.follow_up_date <= current_date and o.commercial_status not in ('won','lost') order by o.follow_up_date limit 6`),
    /* discoveries */ q(sql`select d.id, d.title, concat_ws(' · ', coalesce(d.source_name, 'No source'), d.location) as meta, '/discoveries/' || d.id as href
      from discoveries d where d.status in ('new','needs_verification') order by d.created_at desc limit 6`),
    /* research */ q(sql`select r.id, r.title, concat('Started ', to_char(r.created_at, 'DD Mon')) as meta, '/research/' || r.id as href
      from research_sessions r where r.status = 'open' order by r.updated_at desc limit 6`),
  ];
  // All queries run in parallel — one round-trip of latency instead of a dozen.
  const [lr, r0, r1, r2, r3, r4, r5] = await Promise.all([
    Promise.all(listQueries),
    db.execute(sql`select
    (select count(*) from projects)::int as projects,
    (select count(*) from projects where is_demo)::int as demo,
    (select count(*) from discoveries where created_at > now() - interval '7 days')::int as new_disc,
    (select count(*) from discoveries where status in ('new','needs_verification'))::int as disc_review,
    (select count(*) from projects where status in ('verified','qualified','active_opportunity','won'))::int as verified,
    (select count(*) from opportunities where qualification_status = 'qualified' and commercial_status not in ('won','lost'))::int as qualified,
    (select count(*) from opportunities where commercial_status not in ('won','lost'))::int as open_opps,
    (select count(*) from approvals where status = 'pending')::int as approvals,
    (select count(*) from tasks where due_date < current_date and status in ('open','in_progress'))::int as overdue,
    (select count(*) from tasks where due_date = current_date and status in ('open','in_progress','waiting'))::int as due_today,
    (select count(*) from opportunities where follow_up_date <= current_date and commercial_status not in ('won','lost'))::int as followups_due,
    (select count(*) from research_sessions where status = 'open')::int as research_open`),
    db.execute(sql`select coalesce(s.name, 'Unassigned') as label, count(*)::int as n from projects p left join sectors s on s.id = p.sector_id group by 1 order by 2 desc limit 8`),
    db.execute(sql`select coalesce(nullif(city,''), 'Unknown') as label, count(*)::int as n from projects group by 1 order by 2 desc limit 8`),
    db.execute(sql`
    select 'task' as kind, t.id, t.title, t.due_date as date, t.priority, t.is_demo from tasks t where t.status in ('open','in_progress') and t.due_date <= current_date + 14
    union all
    select 'opportunity', o.id, o.title, o.follow_up_date, o.priority, o.is_demo from opportunities o where o.follow_up_date <= current_date + 14 and o.commercial_status not in ('won','lost')
    order by date asc limit 8`),
    db.execute(sql`select id, title, source_name, published_at, url, relevance, is_demo from news_items order by published_at desc nulls last, created_at desc limit 5`),
    db.execute(sql`select o.id, o.title, o.priority, o.commercial_status, v.name as venture, p.opportunity_score, o.is_demo from opportunities o
    left join ventures v on v.id = o.venture_id left join projects p on p.id = o.project_id
    where o.priority in ('high','urgent') and o.commercial_status not in ('won','lost') order by o.priority = 'urgent' desc, p.opportunity_score desc nulls last limit 6`),
  ]);
  const k = r0.rows[0] as Record<string, number>;
  const bySector = r1.rows as { label: string; n: number }[];
  const byLoc = r2.rows as { label: string; n: number }[];
  const follow = r3.rows as { kind: string; id: string; title: string; date: string; priority: string; is_demo: boolean }[];
  const news = r4.rows as any[];
  const hp = r5.rows as any[];
  const lists: Record<string, Item[]> = Object.fromEntries(listKeys.map((key, i) => [key, lr[i]]));
  const start: { key: string; n: number; title: string; sub: string; href: string; icon: IconName; tone?: "warn" | "bad" | "good"; itemIcon: IconName }[] = [
    { key: "approvals", n: k.approvals, title: "Approvals waiting", sub: "Agents or workflows need your decision", href: "/command?tab=approvals", icon: "bell" as IconName, tone: "warn" as const, itemIcon: "bell" as IconName },
    { key: "overdue", n: k.overdue, title: "Overdue tasks", sub: "Past their due date", href: "/tasks?view=overdue", icon: "alert" as IconName, tone: "bad" as const, itemIcon: "agenda" as IconName },
    { key: "today", n: k.due_today, title: "Due today", sub: "Tasks scheduled for today", href: "/tasks?view=week", icon: "clock" as IconName, itemIcon: "agenda" as IconName },
    { key: "followups", n: k.followups_due, title: "Follow-ups due", sub: "Opportunities to chase now", href: "/opportunities", icon: "opportunities" as IconName, itemIcon: "opportunities" as IconName },
    { key: "discoveries", n: k.disc_review, title: "Discoveries to review", sub: "Save, link, flag or reject", href: "/discoveries", icon: "discover" as IconName, itemIcon: "discover" as IconName },
    { key: "research", n: k.research_open, title: "Research in progress", sub: "Open research sessions", href: "/research", icon: "research" as IconName, itemIcon: "research" as IconName },
  ].filter((x) => x.n > 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head today-head">
        <div>
          <div className="crumbs">{date}</div>
          <h1>{greeting}{first ? `, ${first}.` : "."}<span>{start.length ? `${start.length} thing${start.length > 1 ? "s" : ""} need${start.length > 1 ? "" : "s"} you today.` : "All clear — time to discover."}</span></h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/discoveries"><Icon name="discover" />Discover</Link>
          <Link className="btn primary" href="/projects/new"><Icon name="plus" />New project</Link>
        </div>
      </div>
      <Flash sp={sp} />
      {k.demo > 0 ? <div className="notice warn" style={{ marginBottom: 14 }}>{k.demo} demo project(s) loaded · <Link className="link" href="/settings/data">remove in Settings → Data</Link></div> : null}

      <div className="split" style={{ marginBottom: 14 }}>
        <Card title="Start here" sub="Everything that needs your attention, most urgent first. Click a row to see the items; click an item to go straight to the work." tight>
          {start.length ? start.map((s) => (
            <details key={s.key} className="start" name="start">
              <summary className="start-item">
                <span className={`ico-tile${s.tone ? ` ${s.tone}` : ""}`}><Icon name={s.icon} size={17} /></span>
                <span className="n">{s.n}</span>
                <span className="t"><b>{s.title}</b><small>{s.sub}</small></span>
                <Icon name="arrow" className="go" />
              </summary>
              <div className="start-list">
                {lists[s.key].map((it) => (
                  <Link key={it.id} href={it.href} className="start-row">
                    <Icon name={s.itemIcon} className="muted" />
                    <span className="grow"><span className="ttl" style={{ display: "block" }}>{it.title}</span><span className="meta">{it.meta}</span></span>
                    <Icon name="arrow" />
                  </Link>
                ))}
                {s.n > lists[s.key].length ? <Link href={s.href} className="start-more">See all {s.n} <Icon name="arrow" size={12} /></Link> : <Link href={s.href} className="start-more">Open section <Icon name="arrow" size={12} /></Link>}
              </div>
            </details>
          )) : (
            <Link href="/discoveries" className="start-item">
              <span className="ico-tile good"><Icon name="check" size={17} /></span>
              <span className="t"><b>Nothing waiting on you</b><small>Run a hotels &amp; resorts discovery to find new projects</small></span>
              <Icon name="arrow" className="go" />
            </Link>
          )}
        </Card>
        <div className="dial-grid">
          <KnobStat compact label="New discoveries · 7 days" value={k.new_disc} ratio={dial(k.new_disc, 8)} href="/discoveries?status=all" hint="Potential projects found in the last 7 days, by you or by agents." />
          <KnobStat compact label="Projects" value={k.projects} ratio={dial(k.projects, 25)} href="/projects" hint="All projects tracked in PIP. The dial fills as your pipeline grows." />
          <KnobStat compact label="Discoveries to review" value={k.disc_review} ratio={dial(k.disc_review, 6)} href="/discoveries" hint="Finds waiting for your decision: save as project, link, flag or reject." />
          <KnobStat compact label="Approvals waiting" value={k.approvals} ratio={dial(k.approvals, 4)} href="/command?tab=approvals" hint="Actions proposed by agents or workflows that need your yes or no." />
        </div>
      </div>

      {k.projects === 0 ? (
        <Card><Empty title="No projects yet" action={<div className="row" style={{ justifyContent: "center" }}><Link className="btn primary" href="/discoveries"><Icon name="discover" />Start a discovery</Link><Link className="btn" href="/settings/data">Load demo data</Link></div>}>
          PIP starts empty on purpose — nothing here is decorative.
        </Empty></Card>
      ) : null}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Upcoming" sub="Tasks and opportunity follow-ups due within 14 days" tight actions={<Link className="btn ghost sm" href="/tasks">Agenda <Icon name="arrow" /></Link>}>
          {follow.length ? <div className="list">{follow.map((f) => (
            <Link key={f.kind + f.id} href={f.kind === "task" ? "/tasks" : `/opportunities/${f.id}`} className="li">
              <Icon name={f.kind === "task" ? "agenda" : "opportunities"} className="muted" />
              <div className="grow"><div className="ttl">{f.title} <Demo on={f.is_demo} /></div><div className="meta">{C.label(C.PRIORITY, f.priority)}</div></div>
              <Badge tone={f.date < today ? "bad" : f.date === today ? "warn" : "outline"}>{f.date < today ? "Overdue · " : ""}{fmtDate(f.date)}</Badge>
            </Link>))}</div> : <Empty title="Nothing due" />}
        </Card>
        <Card title="Hot opportunities" sub="High and urgent priority, ranked by project score" tight actions={<Link className="btn ghost sm" href="/opportunities">Pipeline <Icon name="arrow" /></Link>}>
          {hp.length ? <div className="list">{hp.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="li">
              <Icon name="opportunities" className="muted" />
              <div className="grow"><div className="ttl">{o.title} <Demo on={o.is_demo} /></div><div className="meta">{o.venture ?? "No venture"} · {C.label(C.COMMERCIAL_STATUS, o.commercial_status)}</div></div>
              <StatusBadge value={o.priority} opts={C.PRIORITY} /> <Score value={o.opportunity_score} />
            </Link>))}</div> : <Empty title="No hot opportunities" />}
        </Card>
        <Card title="Projects by sector"><Bars rows={bySector} empty="No projects yet" /></Card>
        <Card title="Projects by location"><Bars rows={byLoc.map((r) => ({ ...r, href: r.label !== "Unknown" ? `/projects?city=${encodeURIComponent(r.label)}` : undefined }))} empty="No projects yet" /></Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="Latest news" tight actions={<Link className="btn ghost sm" href="/news">All news <Icon name="arrow" /></Link>}>
          {news.length ? <div className="list">{news.map((n) => (
            <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="li">
              <Icon name="news" className="muted" />
              <div className="grow"><div className="ttl">{n.title} <Demo on={n.is_demo} /></div><div className="meta">{n.source_name ?? "Unknown source"} · {fmtDate(n.published_at) ?? "Date unknown"}</div></div>
              <span className="row" style={{ gap: 4 }}><Badge tone={n.relevance >= 4 ? "good" : "outline"}>{n.relevance}/5</Badge><Hint text="Relevance score you assigned (1–5)." /></span>
              <Icon name="external" className="muted" />
            </a>))}</div> : <Empty title="No news items yet" />}
        </Card>
      </div>
    </>
  );
}
