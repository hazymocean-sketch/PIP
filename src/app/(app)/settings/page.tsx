import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth";
import { changePassword, logoutEverywhere } from "@/server/actions";
import { Submit } from "@/components/client";
import { Card, Flash, fmtDate } from "@/components/ui";

export const metadata = { title: "Settings" };
export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const sessions = (await db.execute(sql`select created_at, expires_at, user_agent from sessions where user_id = ${user.id} order by created_at desc`)).rows as any[];
  return (<>
    <Flash sp={sp} />
    <div className="grid g2">
      <Card title="Administrator profile"><dl className="kv"><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Role</dt><dd>{user.role}</dd></dl>
        <p className="muted small" style={{ marginTop: 10 }}>Single-administrator mode. Multi-user support with roles is planned; there is no public registration.</p></Card>
      <Card title="Change password">
        <form action={changePassword} className="stack" style={{ gap: 10 }}>
          <div className="field"><label>Current password</label><input type="password" name="current" autoComplete="current-password" required /></div>
          <div className="field"><label>New password</label><input type="password" name="next" autoComplete="new-password" minLength={12} required /><span className="help">Min 12 characters with upper, lower case and a number. Changing it signs out all sessions.</span></div>
          <Submit>Change password</Submit>
        </form>
      </Card>
      <Card title="Active sessions" sub="Sessions expire after 7 days">
        <div className="stack small" style={{ gap: 6 }}>{sessions.map((s, i) => <div key={i} className="row" style={{ justifyContent: "space-between" }}><span className="muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.user_agent ?? "Unknown device"}</span><span>since {fmtDate(s.created_at, true)}</span></div>)}</div>
        <form action={logoutEverywhere} style={{ marginTop: 12 }}><Submit className="btn danger">Sign out everywhere</Submit></form>
      </Card>
      <Card title="Security model">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
          <li>Passwords hashed with bcrypt (cost 12); 5 failed attempts lock the account for 15 minutes.</li>
          <li>Sessions: random 256-bit tokens in HTTP-only, SameSite cookies; only an HMAC of the token is stored.</li>
          <li>Every page, server action and API route re-checks the session server-side.</li>
          <li>All input validated server-side; SQL is parameterised.</li>
          <li>API keys live only in server environment variables and are never sent to the browser.</li>
          <li>Security headers: no framing, no sniffing, no indexing.</li>
        </ul>
      </Card>
    </div>
  </>);
}
