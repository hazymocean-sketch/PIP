import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { currentUser } from "@/server/auth";
import { getSearchProvider } from "@/server/ai/providers";
import { goLive, stopLive } from "@/server/live";
import { isUuid } from "@/lib/normalize";

/** Toggle "on air" for a project. Going live opens deals in the CRM and marks research as starting. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.on === false) { await stopLive(id); return NextResponse.json({ live: false }); }
    const r = await goLive(id);
    const [p] = await db.select({ isDemo: S.projects.isDemo }).from(S.projects).where(eq(S.projects.id, id));
    const research = !!getSearchProvider() && !p?.isDemo && b.research !== false;
    if (research) await db.update(S.projects).set({ liveResearchStatus: "running", liveResearchAt: new Date() }).where(eq(S.projects.id, id));
    return NextResponse.json({ live: true, dealsCreated: r.created, research });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
