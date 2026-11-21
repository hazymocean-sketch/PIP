import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand" style={{ justifyContent: "center", paddingBottom: 20 }}>
          <div className="brand-mark">PIP</div>
          <div><div className="brand-name">Projects Intelligence Portal</div><div className="brand-sub">Private — authorised access only</div></div>
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
        <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}>No public registration. The administrator account is created with <code>npm run admin:set</code>.</p>
      </div>
    </div>
  );
}
