import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import * as S from "@/db/schema";
import { currentUser } from "@/server/auth";

const TABLES: Record<string, any> = {
  projects: S.projects, companies: S.companies, contacts: S.contacts, opportunities: S.opportunities, sources: S.sources,
  discoveries: S.discoveries, news: S.newsItems, tasks: S.tasks, activities: S.activities, research: S.researchSessions,
  ventures: S.ventures, agents: S.agents, workflows: S.workflows, project_ventures: S.projectVentures, project_companies: S.projectCompanies,
};

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { if (v === null || v === undefined) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const what = req.nextUrl.searchParams.get("table") ?? "all";
  const stamp = new Date().toISOString().slice(0, 10);
  if (what === "all") {
    const out: Record<string, unknown[]> = {};
    for (const [k, t] of Object.entries(TABLES)) out[k] = await db.select().from(t);
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), data: out }, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="pip-export-${stamp}.json"` } });
  }
  const t = TABLES[what];
  if (!t) return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  const rows = await db.select().from(t);
  return new NextResponse(csv(rows as any), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pip-${what}-${stamp}.csv"` } });
}
