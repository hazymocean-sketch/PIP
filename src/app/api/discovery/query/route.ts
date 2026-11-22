import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { runDiscoveryQuery } from "@/server/research";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const sessionId = typeof b.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(b.sessionId) ? b.sessionId : null;
  const query = typeof b.query === "string" ? b.query.trim().slice(0, 500) : "";
  if (!sessionId || !query) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await runDiscoveryQuery(sessionId, query));
  } catch (e) {
    return NextResponse.json({ created: 0, skipped: 0, errors: [(e as Error).message] });
  }
}
