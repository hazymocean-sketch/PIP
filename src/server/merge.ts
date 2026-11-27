import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { audit } from "./core";

/** Link tables whose key includes project_id: rows that would collide after the move are dropped first. */
const LINK_KEYS: Record<string, string[]> = {
  project_companies: ["company_id", "role"], project_ventures: ["venture_id"], project_contacts: ["contact_id"], contact_candidates: ["lusha_id"],
};

/**
 * Merge a duplicate project into the one you keep: every link (ventures, companies, people, deals, sources,
 * research, tasks, meetings, discoveries…) moves across, empty fields are filled from the duplicate, then the duplicate is deleted.
 */
export async function mergeProjects(keepId: string, dropId: string) {
  if (keepId === dropId) throw new Error("Pick a different project to merge");
  const [keep] = await db.select().from(S.projects).where(eq(S.projects.id, keepId));
  const [drop] = await db.select().from(S.projects).where(eq(S.projects.id, dropId));
  if (!keep || !drop) throw new Error("Project not found");

  // Every column that points at projects.id, read from the database itself so nothing is missed
  const refs = (await db.execute(sql`select c.conrelid::regclass::text as tbl, a.attname as col from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.confrelid = 'projects'::regclass and c.contype = 'f'`)).rows as { tbl: string; col: string }[];

  await db.transaction(async (tx) => {
    for (const { tbl, col } of refs) {
      const t = sql.raw(`"${tbl.replace(/"/g, "")}"`), c = sql.raw(`"${col.replace(/"/g, "")}"`);
      const keys = LINK_KEYS[tbl.replace(/"/g, "")];
      if (keys && col === "project_id") {
        const same = sql.raw(keys.map((k) => `d."${k}" is not distinct from k."${k}"`).join(" and "));
        await tx.execute(sql`delete from ${t} d where d.${c} = ${dropId} and exists (select 1 from ${t} k where k.${c} = ${keepId} and ${same})`);
      }
      await tx.execute(sql`update ${t} set ${c} = ${keepId} where ${c} = ${dropId}`);
    }
    await tx.execute(sql`update agent_runs set target_id = ${keepId} where target_type = 'project' and target_id = ${dropId}`);

    // Fill gaps on the kept project from the duplicate (never overwrite what's there)
    const fill: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(drop)) {
      if (["id", "name", "normalizedName", "createdAt", "updatedAt", "isDemo"].includes(k)) continue;
      const cur = (keep as Record<string, unknown>)[k];
      if ((cur === null || cur === "" || cur === "unknown") && v !== null && v !== "" && v !== "unknown") fill[k] = v;
    }
    if (drop.isLive && !keep.isLive) { fill.isLive = true; fill.liveSince = drop.liveSince; }
    const notes = [keep.researchNotes, `Merged with duplicate “${drop.name}” on ${new Date().toISOString().slice(0, 10)}.`].filter(Boolean).join("\n");
    await tx.update(S.projects).set({ ...fill, researchNotes: notes, updatedAt: new Date() }).where(eq(S.projects.id, keepId));
    await tx.delete(S.projects).where(eq(S.projects.id, dropId));
  });
  await audit("merge", "projects", dropId, `Merged “${drop.name}” into “${keep.name}”`, drop as unknown as Record<string, unknown>);

  // If it's live, make sure every venture now has a deal
  const [after] = await db.select().from(S.projects).where(eq(S.projects.id, keepId));
  if (after.isLive) { const { goLive } = await import("./live"); await goLive(keepId); }
  return after;
}
