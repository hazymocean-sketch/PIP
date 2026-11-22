import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db";
import { seedBase } from "../src/server/seed";
import { appSettings } from "../src/db/schema";
import { getAIProvider, getSearchProvider } from "../src/server/ai/providers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function passwordShape() {
  const p = process.env.DATABASE_PASSWORD;
  if (p === undefined) return "DATABASE_PASSWORD is NOT set";
  return `DATABASE_PASSWORD length ${p.length} (after trimming ${p.trim().length}), ` +
    `letters ${(p.match(/[a-z]/gi) ?? []).length}, digits ${(p.match(/[0-9]/g) ?? []).length}, ` +
    `other characters ${(p.match(/[^a-z0-9]/gi) ?? []).length}, has spaces/newlines ${/\s/.test(p)}`;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("DATABASE_URL not set — skipping migrations"); return; }
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("select 1");
      console.log("✓ connected to database");
      break;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.error(`✗ database connection attempt ${attempt} failed: ${err.code ?? ""} ${err.message ?? e}`);
      if (err.code === "28P01") console.error(`  → password rejected by Supabase. ${passwordShape()}. Compare this length with the password you set in Supabase.`);
      if (attempt >= 4) throw e;
      await sleep(15000);
    }
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
  await seedBase(); // idempotent: only inserts missing configuration
  console.log("✓ base configuration ensured");
  await checkIntegrations();
  await pool.end();
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });

/** Live check of search + AI keys at deploy time. Never prints keys; never fails the build. */
async function checkIntegrations() {
  const result: Record<string, { ok: boolean; detail: string; at: string }> = {};
  const at = new Date().toISOString();
  const search = getSearchProvider();
  if (search) {
    try {
      const r = await search.search("new hotel announced Dubai", { maxResults: 3 });
      result.search = { ok: r.length > 0, detail: `${search.label}: ${r.length} live results${r[0] ? ` (e.g. “${r[0].title.slice(0, 70)}”)` : ""}`, at };
    } catch (e) { result.search = { ok: false, detail: `${search.label}: ${(e as Error).message}`, at }; }
  } else result.search = { ok: false, detail: "Not configured (SEARCH_PROVIDER + key missing)", at };
  const ai = getAIProvider();
  if (ai) {
    try {
      const txt = await ai.complete("Reply with exactly: OK", "Connectivity check", { maxTokens: 5 });
      result.ai = { ok: /ok/i.test(txt), detail: `${ai.label}: responded`, at };
    } catch (e) {
      const m = (e as Error).message;
      result.ai = { ok: false, detail: `${ai.label}: ${m}${/400|402|credit/i.test(m) ? " — likely no credit on the account yet" : ""}`, at };
    }
  } else result.ai = { ok: false, detail: "Not configured (AI_PROVIDER + key missing)", at };
  if (process.env.LUSHA_API_KEY) {
    try {
      const { lusha } = await import("../src/server/lusha");
      const u = await lusha.usage();
      const rem = u.credits?.remaining;
      result.lusha = { ok: true, detail: `Lusha connected${rem !== undefined ? ` · ${rem} of ${u.credits?.total ?? "?"} credits remaining` : ""}${u.plan?.category ? ` · plan: ${u.plan.category}` : ""}`, at };
    } catch (e) { result.lusha = { ok: false, detail: (e as Error).message, at }; }
  } else result.lusha = { ok: false, detail: "Not configured (LUSHA_API_KEY missing)", at };
  for (const [k, v] of Object.entries(result)) console.log(`${v.ok ? "✓" : "✗"} integration ${k}: ${v.detail}`);
  await db.insert(appSettings).values({ key: "integration_check", value: result }).onConflictDoUpdate({ target: appSettings.key, set: { value: result, updatedAt: new Date() } });
}
