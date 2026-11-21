import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-time setup" };

/** One-time admin creation. Only works while no user exists AND SETUP_TOKEN is set in the server environment. */
export default async function Setup({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const n = (await db.execute(sql`select count(*)::int as n from users`)).rows[0] as { n: number };
  if (n.n > 0) redirect("/login");
  const enabled = !!process.env.SETUP_TOKEN && process.env.SETUP_TOKEN.length >= 16;
  return (
    <div className="login-wrap"><div className="login" style={{ maxWidth: 420 }}>
      <div className="brand" style={{ justifyContent: "center", paddingBottom: 20 }}><div className="brand-mark">PIP</div><div><div className="brand-name">First-time setup</div><div className="brand-sub">Create the administrator account</div></div></div>
      <div className="card"><div className="card-b">
        {sp.error ? <div className="flash error">{sp.error}</div> : null}
        {!enabled ? <div className="notice warn">Setup is locked. Add a <code>SETUP_TOKEN</code> environment variable (16+ random characters) in your hosting dashboard, redeploy, then reload this page.</div> : (
          <form method="post" action="/api/setup" className="stack">
            <div className="field"><label htmlFor="token">Setup token</label><input id="token" name="token" type="password" required autoComplete="off" /><span className="help">The SETUP_TOKEN value from your hosting dashboard.</span></div>
            <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" required /></div>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" /><span className="help">Min 12 characters, upper and lower case and a number.</span></div>
            <button className="btn primary" type="submit">Create administrator</button>
          </form>)}
      </div></div>
      <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}>This page disables itself permanently once an administrator exists.</p>
    </div></div>
  );
}
