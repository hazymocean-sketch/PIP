import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Flash, PageHead, SectionTabs } from "@/components/ui";
import { Icon } from "@/components/icons";
import { completeTask } from "@/server/actions";
import { addDays, addMonths, dayOf, hourOf, isoDay, label, startUtc, timeOf, todayDubai, weekStart } from "@/lib/dubai";

export const metadata = { title: "Agenda" };

type Item = { kind: "meeting" | "task" | "follow"; id: string; title: string; day: string; time?: string; end?: string; hour?: number; href: string; meta?: string | null; cancelled?: boolean };

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = ["day", "week", "month"].includes(sp.view) ? sp.view : "week";
  const today = todayDubai();
  const d = isoDay(sp.d) ?? today;

  // Visible range
  const [from, days] = view === "day" ? [d, 1] : view === "week" ? [weekStart(d), 7] : [weekStart(`${d.slice(0, 7)}-01`), 42];
  const to = addDays(from, days);
  const range = Array.from({ length: days }, (_, i) => addDays(from, i));

  const [mR, tR, fR] = await Promise.all([
    db.execute(sql`select m.id, m.title, m.starts_at, m.ends_at, m.status, m.location, coalesce(p.name, o.title, c.name) as rel from meetings m
      left join projects p on p.id = m.project_id left join opportunities o on o.id = m.opportunity_id left join companies c on c.id = m.company_id
      where m.starts_at >= ${startUtc(from).toISOString()} and m.starts_at < ${startUtc(to).toISOString()} order by m.starts_at`),
    db.execute(sql`select t.id, t.title, t.due_date, coalesce(p.name, o.title) as rel, t.project_id, t.opportunity_id from tasks t
      left join projects p on p.id = t.project_id left join opportunities o on o.id = t.opportunity_id
      where t.due_date >= ${from} and t.due_date < ${to} and t.status in ('open','in_progress','waiting')`),
    db.execute(sql`select o.id, o.title, o.follow_up_date, o.next_action from opportunities o
      where o.follow_up_date >= ${from} and o.follow_up_date < ${to} and o.commercial_status not in ('won','lost')`),
  ]);
  const items: Item[] = [
    ...(mR.rows as any[]).map((m) => { const s = new Date(m.starts_at); const e = m.ends_at ? new Date(m.ends_at) : null;
      return { kind: "meeting" as const, id: m.id, title: m.title, day: dayOf(s), time: timeOf(s), end: e ? timeOf(e) : undefined, hour: hourOf(s), href: `/meetings/${m.id}/edit`, meta: [m.rel, m.location].filter(Boolean).join(" · ") || null, cancelled: m.status === "cancelled" }; }),
    ...(tR.rows as any[]).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, day: String(t.due_date).slice(0, 10), href: `/tasks/${t.id}/edit?back=${encodeURIComponent(`/agenda?view=${view}&d=${d}`)}`, meta: t.rel })),
    ...(fR.rows as any[]).map((o) => ({ kind: "follow" as const, id: o.id, title: o.next_action ? `${o.next_action} — ${o.title}` : `Follow up: ${o.title}`, day: String(o.follow_up_date).slice(0, 10), href: `/opportunities/${o.id}` })),
  ];
  // Meetings first (by time), then follow-ups, then tasks
  const rank = (i: Item) => (i.kind === "meeting" ? 0 : i.kind === "follow" ? 1 : 2);
  const byDay = (day: string) => items.filter((i) => i.day === day).sort((a, b) => rank(a) - rank(b) || (a.time ?? "").localeCompare(b.time ?? ""));

  const step = (n: number) => view === "day" ? addDays(d, n) : view === "week" ? addDays(d, 7 * n) : addMonths(d, n);
  const href = (patch: { view?: string; d?: string }) => `/agenda?view=${patch.view ?? view}&d=${patch.d ?? d}`;
  const title = view === "day" ? label(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "week" ? `${label(from, { day: "numeric", month: "short" })} – ${label(addDays(from, 6), { day: "numeric", month: "short", year: "numeric" })}`
    : label(d, { month: "long", year: "numeric" });
  const newHref = (day: string, time?: string) => `/meetings/new?date=${day}${time ? `&time=${time}` : ""}&back=${encodeURIComponent(href({ d: day }))}`;
  const newTask = (day: string) => `/tasks/new?date=${day}&back=${encodeURIComponent(href({ d: day }))}`;
  const here = href({});
  const counts = { meeting: items.filter((i) => i.kind === "meeting" && !i.cancelled).length, task: items.filter((i) => i.kind === "task").length, follow: items.filter((i) => i.kind === "follow").length };

  const Chip = ({ i, compact }: { i: Item; compact?: boolean }) => i.kind === "task" ? (
    <div className="cal-task">
      <form action={completeTask.bind(null, i.id, here)}><button type="submit" className="cal-tick" title="Mark done" aria-label={`Mark “${i.title}” done`} /></form>
      <Link href={i.href} className={`cal-chip task${compact ? " compact" : ""}`} title={[i.title, i.meta].filter(Boolean).join(" — ")}><span className="tt">{i.title}</span>{!compact && i.meta ? <span className="mt">{i.meta}</span> : null}</Link>
    </div>
  ) : (
    <Link href={i.href} className={`cal-chip ${i.kind}${i.cancelled ? " cancelled" : ""}`} title={[i.title, i.meta].filter(Boolean).join(" — ")}>
      {i.time ? <span className="tm">{i.time}</span> : <span className="dot" />}<span className="tt">{i.title}</span>
      {!compact && i.meta ? <span className="mt">{i.meta}</span> : null}
    </Link>
  );

  return (<>
    <PageHead title="Agenda" sub="Meetings, tasks due and CRM follow-ups on one calendar. Times are Dubai time." actions={<div className="row"><Link className="btn" href={newTask(d)}><Icon name="check" />New task</Link><Link className="btn primary" href={newHref(d)}><Icon name="plus" />New meeting</Link></div>} />
    <SectionTabs section="agenda" active="Calendar" />
    <Flash sp={sp} />
    <div className="cal-bar">
      <div className="row">
        <Link className="btn sm" href={href({ d: step(-1) })} aria-label="Previous"><Icon name="back" /></Link>
        <Link className="btn sm" href={href({ d: today })}>Today</Link>
        <Link className="btn sm" href={href({ d: step(1) })} aria-label="Next"><Icon name="arrow" /></Link>
        <h2 className="cal-title">{title}</h2>
      </div>
      <div className="row">
        <span className="cal-legend"><i className="meeting" />{counts.meeting} meetings <i className="task" />{counts.task} tasks <i className="follow" />{counts.follow} follow-ups</span>
        <nav className="seg" aria-label="View">{(["day", "week", "month"] as const).map((v) => <a key={v} className={view === v ? "on" : ""} href={href({ view: v })}>{v}</a>)}</nav>
      </div>
    </div>

    {view === "month" ? (
      <div className="card cal-month">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {range.map((day) => { const list = byDay(day); const out = day.slice(0, 7) !== d.slice(0, 7);
          return (
            <div key={day} className={`cal-cell${out ? " out" : ""}${day === today ? " today" : ""}`}>
              <div className="cal-cell-h"><Link href={href({ view: "day", d: day })} className="num">{Number(day.slice(8))}</Link><span className="adds"><Link href={newHref(day)} className="add" title="Add meeting" aria-label={`Add meeting on ${day}`}>+M</Link><Link href={newTask(day)} className="add" title="Add task" aria-label={`Add task on ${day}`}>+T</Link></span></div>
              {list.slice(0, 3).map((i) => <Chip key={i.kind + i.id} i={i} compact />)}
              {list.length > 3 ? <Link className="more" href={href({ view: "day", d: day })}>+{list.length - 3} more</Link> : null}
            </div>); })}
      </div>
    ) : view === "week" ? (
      <div className="card cal-week">
        {range.map((day) => { const list = byDay(day);
          return (
            <div key={day} className={`cal-col${day === today ? " today" : ""}`}>
              <Link href={href({ view: "day", d: day })} className="cal-col-h"><span>{label(day, { weekday: "short" })}</span><b>{Number(day.slice(8))}</b></Link>
              <div className="cal-col-b">{(() => { const meet = list.filter((i) => i.kind === "meeting"); const rest = list.filter((i) => i.kind !== "meeting");
                return <>{meet.map((i) => <Chip key={i.kind + i.id} i={i} />)}{rest.slice(0, 3).map((i) => <Chip key={i.kind + i.id} i={i} compact />)}
                  {rest.length > 3 ? <Link className="more" href={href({ view: "day", d: day })}>+{rest.length - 3} more tasks</Link> : null}</>; })()}
                <div className="cal-adds"><Link href={newHref(day)} className="cal-add">+ Meeting</Link><Link href={newTask(day)} className="cal-add">+ Task</Link></div></div>
            </div>); })}
      </div>
    ) : (
      <div className="cal-day">
        <div className="card cal-hours">
          {[null, ...Array.from({ length: 15 }, (_, i) => i + 7), 99].map((h) => {
            const list = byDay(d).filter((i) => i.time && (h === null ? i.hour! < 7 : h === 99 ? i.hour! > 21 : i.hour === h));
            if ((h === null || h === 99) && !list.length) return null;
            const hh = h === null ? "Early" : h === 99 ? "Late" : `${String(h).padStart(2, "0")}:00`;
            return (
              <div key={String(h)} className="cal-hour">
                <span className="hl">{hh}</span>
                <div className="hb">{list.map((i) => <Chip key={i.id} i={i} />)}{h !== null && h !== 99 ? <Link className="slot" href={newHref(d, hh)} aria-label={`Add at ${hh}`} /> : null}</div>
              </div>);
          })}
        </div>
        <div className="card cal-allday">
          <div className="card-h"><h2>Tasks &amp; follow-ups</h2><Link className="btn sm" href={newTask(d)}>+ Task</Link></div>
          <div className="card-b stack" style={{ gap: 8 }}>{byDay(d).filter((i) => !i.time).map((i) => <Chip key={i.kind + i.id} i={i} />)}
            {!byDay(d).some((i) => !i.time) ? <span className="muted small">Nothing due. Add a task for this day.</span> : null}</div>
        </div>
      </div>
    )}
  </>);
}
