import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Public liveness + latency probe. Returns timings only — no data. */
export async function GET() {
  const times: number[] = [];
  try {
    for (let i = 0; i < 3; i++) { const t = performance.now(); await db.execute(sql`select ${i}::int as n`); times.push(Math.round(performance.now() - t)); }
    return Response.json({ ok: true, region: process.env.VERCEL_REGION ?? "local", dbMs: times }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, region: process.env.VERCEL_REGION ?? "local" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
