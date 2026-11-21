import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authCore } from "@/server/auth-core";

export async function POST(req: NextRequest) {
  const to = (p: string) => NextResponse.redirect(new URL(p, req.url), 303);
  const origin = req.headers.get("origin"); const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const n = (await db.execute(sql`select count(*)::int as n from users`)).rows[0] as { n: number };
  if (n.n > 0) return to("/login");
  const secret = process.env.SETUP_TOKEN ?? "";
  const fd = await req.formData();
  const token = String(fd.get("token") ?? "");
  if (secret.length < 16 || token.length !== secret.length || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return to("/setup?error=Invalid%20setup%20token");
  const email = String(fd.get("email") ?? "").trim().slice(0, 320);
  const name = String(fd.get("name") ?? "").trim().slice(0, 100) || "Administrator";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return to("/setup?error=Invalid%20email");
  try {
    const id = await authCore.upsertAdmin(email, String(fd.get("password") ?? "").slice(0, 200), name);
    await db.update(users).set({ name }).where(eq(users.id, id));
  } catch (e) {
    return to(`/setup?error=${encodeURIComponent((e as Error).message)}`);
  }
  return to("/login?ok=Administrator%20created%20%E2%80%94%20please%20sign%20in.%20You%20can%20now%20delete%20SETUP_TOKEN.");
}
