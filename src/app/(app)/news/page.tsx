import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as C from "@/lib/constants";
import { Badge, Card, Demo, Empty, Flash, PageHead, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "News & Updates" };
export default async function News({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds = [sql`true`];
  if (sp.q) conds.push(sql`(n.title ilike ${"%" + sp.q + "%"} or n.summary ilike ${"%" + sp.q + "%"})`);
  if (sp.category) conds.push(sql`n.category = ${sp.category}`);
  if (sp.sector) conds.push(sql`n.sector_id = ${sp.sector}`);
  if (sp.location) conds.push(sql`n.location ilike ${sp.location}`);
  if (sp.developer) conds.push(sql`n.developer_id = ${sp.developer}`);
  if (sp.from) conds.push(sql`n.published_at >= ${sp.from}`);
  if (sp.to) conds.push(sql`n.published_at <= ${sp.to}`);
  if (sp.minRel) conds.push(sql`n.relevance >= ${Number(sp.minRel)}`);
  const rows = (await db.execute(sql`select n.*, s.name as sector, c.name as developer, p.name as project from news_items n left join sectors s on s.id = n.sector_id
    left join companies c on c.id = n.developer_id left join projects p on p.id = n.project_id where ${sql.join(conds, sql` and `)}
    order by n.published_at desc nulls last, n.created_at desc limit 300`)).rows as any[];
  const sectors = (await db.execute(sql`select id, name from sectors where parent_id is null order by sort_order`)).rows as any[];
  const devs = (await db.execute(sql`select id, name from companies where category in ('developer','owner') order by name`)).rows as any[];
  return (<>
    <PageHead title="News & Updates" sub="Monitored announcements. Duplicates are blocked by normalised URL. Automated monitoring activates when a search provider is connected."
      actions={<Link className="btn primary" href="/news/new"><Icon name="plus" />Add news item</Link>} />
    <Flash sp={sp} />
    <form className="filters">
      <input type="search" name="q" placeholder="Search headlines" defaultValue={sp.q ?? ""} />
      <select name="category" defaultValue={sp.category ?? ""}><option value="">All categories</option>{C.NEWS_CATEGORY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <select name="sector" defaultValue={sp.sector ?? ""}><option value="">All sectors</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input name="location" placeholder="Location" defaultValue={sp.location ?? ""} />
      <select name="developer" defaultValue={sp.developer ?? ""}><option value="">Any developer</option>{devs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input type="date" name="from" defaultValue={sp.from ?? ""} title="From" /><input type="date" name="to" defaultValue={sp.to ?? ""} title="To" />
      <select name="minRel" defaultValue={sp.minRel ?? ""}><option value="">Any relevance</option>{[5, 4, 3].map((n) => <option key={n} value={n}>{n}+ relevance</option>)}</select>
      <button className="btn">Filter</button></form>
    <Card tight>{rows.length ? <div className="list">{rows.map((n) => (
      <div key={n.id} className="li">
        <div className="grow">
          <div className="ttl"><a className="link" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> <Demo on={n.is_demo} /></div>
          <div className="meta">{n.source_name ?? "Unknown source"} · {fmtDate(n.published_at) ?? "Date unknown"} · {C.label(C.NEWS_CATEGORY, n.category)}{n.location ? ` · ${n.location}` : ""}{n.developer ? ` · ${n.developer}` : ""}</div>
          {n.summary ? <div className="small" style={{ marginTop: 4, color: "var(--text-2)" }}>{n.summary}</div> : null}
          {n.project ? <div className="small" style={{ marginTop: 4 }}>Project: <Link className="link" href={`/projects/${n.project_id}`}>{n.project}</Link></div> : null}
        </div>
        <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}><Badge tone={n.relevance >= 4 ? "good" : "outline"}>Relevance {n.relevance}/5</Badge><Link className="btn ghost sm" href={`/news/${n.id}/edit`}><Icon name="edit" />Edit</Link></div>
      </div>))}</div> : <Empty title="No news items" action={<Link className="btn primary" href="/news/new"><Icon name="plus" />Add news item</Link>}>Each item needs a publication date, source, original URL and a short summary.</Empty>}</Card>
  </>);
}
