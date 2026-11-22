import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { startDiscoverySession } from "@/server/research";

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const query = str(b.query, 500);
  const location = str(b.location, 100);
  const r = await startDiscoverySession({
    title: str(b.title) || `Discovery — ${query || location || "hotels & resorts"}`,
    query, location, sectorId: uuid(b.sectorId), dateFrom: date(b.dateFrom), dateTo: null, template: b.template === "custom" ? "custom" : "hotels",
  });
  return NextResponse.json({ sessionId: r.session.id, queries: r.queries, provider: r.provider });
}
