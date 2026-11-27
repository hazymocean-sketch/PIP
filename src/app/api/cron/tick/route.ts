import { NextResponse, type NextRequest } from "next/server";
export const maxDuration = 300; // daily tick may run several discovery searches back to back
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/server/workflows/engine";

/** Scheduled automation tick. Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tick();
  return NextResponse.json({ ok: true, ...result });
}
