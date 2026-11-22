import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { finishDiscoverySession } from "@/server/research";

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const sessionId = typeof b.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(b.sessionId) ? b.sessionId : null;
  if (!sessionId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  const errors = Array.isArray(b.errors) ? b.errors.filter((e: unknown) => typeof e === "string").slice(0, 50).map((e: string) => e.slice(0, 300)) : [];
  await finishDiscoverySession(sessionId, { created: n(b.created), skipped: n(b.skipped), errors });
  return NextResponse.json({ ok: true });
}
