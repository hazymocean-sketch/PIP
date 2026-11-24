import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { deepResearch } from "@/server/live";
import { isUuid } from "@/lib/normalize";

export const maxDuration = 60;

/** Deep research for one project (searches → sources; AI fills empty facts when connected). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try { return NextResponse.json(await deepResearch(id)); }
  catch (e) { return NextResponse.json({ status: "failed", note: (e as Error).message }, { status: 500 }); }
}
