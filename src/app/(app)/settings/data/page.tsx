import { sql } from "drizzle-orm";
import { db } from "@/db";
import { loadDemoData, purgeDemoData } from "@/server/actions";
import { Submit } from "@/components/client";
import { Card, Flash } from "@/components/ui";

const TABLES = ["projects", "companies", "contacts", "opportunities", "sources", "discoveries", "news", "tasks", "activities", "research", "project_ventures", "project_companies"];
export default async function Data({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const demo = (await db.execute(sql`select (select count(*) from projects where is_demo)::int + (select count(*) from companies where is_demo)::int + (select count(*) from opportunities where is_demo)::int + (select count(*) from agent_runs where is_demo)::int as n`)).rows[0] as { n: number };
  const audit = (await db.execute(sql`select count(*)::int as n from audit_log where action = 'delete'`)).rows[0] as { n: number };
  return (<>
    <Flash sp={sp} />
    <div className="grid g2">
      <Card title="Export">
        <p className="small muted">Download your data. Exports are generated server-side for the signed-in administrator only.</p>
        <div className="row" style={{ marginTop: 8 }}><a className="btn primary" href="/api/export?table=all">Full export (JSON)</a></div>
        <div className="row" style={{ marginTop: 10, gap: 6 }}>{TABLES.map((t) => <a key={t} className="btn sm" href={`/api/export?table=${t}`}>{t}.csv</a>)}</div>
      </Card>
      <Card title="Backup & recovery">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
          <li><strong>Database:</strong> Supabase takes daily automatic backups (point-in-time recovery on paid plans).</li>
          <li><strong>Your own copy:</strong> <code>npm run backup</code> writes a timestamped <code>pg_dump</code> to <code>backups/</code>. Store it off-site.</li>
          <li><strong>Restore:</strong> <code>psql "$DATABASE_URL" &lt; backups/pip-YYYYMMDD.sql</code></li>
          <li><strong>Deleted records:</strong> every delete keeps a JSON snapshot in the audit log ({audit.n} so far).</li>
          <li><strong>Code:</strong> the private GitHub repository is the source of truth; migrations are versioned in <code>drizzle/</code>.</li>
        </ul>
      </Card>
      <Card title="Demo data" sub="Fictional records to explore the workflows — never mixed with real research">
        <p className="small muted">Every demo record is prefixed [DEMO], flagged in the database, uses example.com URLs, and is badged DEMO in the interface. {demo.n ? `${demo.n} demo records currently loaded.` : "None loaded."}</p>
        <div className="row" style={{ marginTop: 10 }}>
          {!demo.n ? <form action={loadDemoData}><Submit pendingText="Loading…">Load demo data</Submit></form> : null}
          {demo.n ? <form action={purgeDemoData} className="row"><input name="confirmText" placeholder="Type DELETE DEMO" style={{ width: 170 }} /><Submit className="btn danger">Remove all demo data</Submit></form> : null}
        </div>
      </Card>
    </div>
  </>);
}
