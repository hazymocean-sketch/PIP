import { NextResponse, type NextRequest } from "next/server";
import { authCore } from "@/server/auth-core";
import { SESSION_COOKIE } from "@/server/auth";

export async function POST(req: NextRequest) {
  // Same-origin check (CSRF protection for the login form)
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const fd = await req.formData();
  const email = String(fd.get("email") ?? "").slice(0, 320);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  const res = await authCore.login(email, password, req.headers.get("user-agent")?.slice(0, 300) ?? null);
  const base = new URL(req.url);
  const to = (p: string) => { const u = new URL(p, base); return NextResponse.redirect(u, 303); };
  if ("error" in res) return to(`/login?error=${encodeURIComponent(res.error ?? "Sign-in failed")}`);
  const r = to("/");
  r.cookies.set(SESSION_COOKIE, res.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true", path: "/", expires: res.expires });
  return r;
}
