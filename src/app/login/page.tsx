import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login">
        <div style={{ marginBottom: 22 }}>
          <div className="brand" style={{ padding: "0 0 22px" }}><div className="brand-mark">PIP</div><div><div className="brand-name">Projects Intelligence</div><div className="brand-sub">UAE · GCC</div></div></div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Private portal</div>
          <h1>Intelligence,<br /><span style={{ fontWeight: 300, color: "var(--muted)" }}>before it&rsquo;s obvious.</span></h1>
        </div>
        <div className="card"><div className="card-b">
          {sp.error ? <div className="flash error">{sp.error}</div> : null}
          {sp.ok ? <div className="flash ok">{sp.ok}</div> : null}
          <form method="post" action="/api/auth/login" className="stack">
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
            <button className="btn primary" type="submit">Sign in</button>
          </form>
        </div></div>
        <p className="muted small" style={{ marginTop: 14 }}>No public registration. First run? Visit <a className="link" href="/setup">/setup</a>.</p>
      </div>
    </div>
  );
}
