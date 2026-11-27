import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
await ctx.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await ctx.newPage(); const errs = []; let fails = 0; const stamp = Date.now();
p.on("dialog", (d) => d.accept());
p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
p.on("pageerror", (e) => errs.push("JS " + e.message.slice(0, 60) + " @ " + p.url()));
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };
const t = async (n, fn) => { try { await fn(); ok(n, true); } catch (e) { ok(`${n}: ${e.message.split("\n")[0]}`, false); } };
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

await t("Discover: no Template, no manual add", async () => {
  await p.goto(base + "/discoveries");
  if (await p.locator("select[name=template]").count()) throw new Error("template still there");
  if (await p.locator("text=Add a discovery manually").count()) throw new Error("manual add still there");
});
await t("Discover: sector run uses that sector's searches", async () => {
  const opt = await p.locator("select[name=sectorId] option", { hasText: "Healthcare" }).first().getAttribute("value");
  await p.selectOption("select[name=sectorId]", opt); await p.fill("input[name=location]", "Dubai");
  await p.click("button:has-text('Run discovery')");
  await p.waitForURL(/\/research\//, { timeout: 60000 });
  const txt = await p.content(); if (!/hospital/i.test(txt)) throw new Error("no healthcare queries on the session page");
});
await t("Research: no Discovery search link", async () => { await p.goto(base + "/research"); if (await p.locator("text=Discovery search →").count()) throw new Error("still there"); });

// Duplicate-project merge + venture listing in CRM
const name = `E2E Holm ${stamp}`;
let keepUrl = "";
await t("two copies of a project → Merge on project page", async () => {
  for (const suffix of ["", " Towers"]) {
    await p.goto(base + "/projects/new"); await p.fill("input[name=name]", name + suffix);
    await Promise.all([p.waitForURL(/\/projects\/[0-9a-f-]{36}/), p.click("button[type=submit]:has-text('Create')")]);
    const boxes = p.locator("input[type=checkbox][name=ventureId]"); await boxes.nth(suffix ? 1 : 0).check();
    await Promise.all([p.waitForURL(/ok=/), p.click("button:has-text('Save relevance')")]);
    keepUrl = p.url().split("?")[0];
  }
  await p.locator(".dup-row").filter({ has: p.locator(`a.link:text-is("${name}")`) }).locator("button:has-text('Merge into this project')").click();
  await p.waitForURL(/Merged/, { timeout: 15000 }); await p.waitForLoadState("networkidle"); await p.locator(".flash").first().waitFor();
  const n = await p.locator("input[type=checkbox][name=ventureId]:checked").count(); if (n !== 2) throw new Error(`ventures after merge: ${n}`);
});
await t("go live → CRM shows one row with both ventures", async () => {
  await p.locator("button.onair").first().click(); await p.locator("button.onair.live").first().waitFor({ timeout: 30000 });
  await p.goto(base + "/opportunities?q=" + encodeURIComponent(name));
  const rows = await p.locator(".crm-proj:not(.h)").count(); const deals = await p.locator(".crm-proj:not(.h) .crm-deal:not(.missing)").count();
  if (rows !== 1 || deals !== 2) throw new Error(`rows ${rows}, deals ${deals}`);
});
await p.waitForTimeout(800); await p.addStyleTag({ content: "*{animation:none!important}" }); await p.screenshot({ path: "test-artifacts/crm-grouped.png" });
await t("adding a venture to a live project opens its deal", async () => {
  await p.goto(keepUrl); const boxes = p.locator("input[type=checkbox][name=ventureId]"); await boxes.nth(2).check();
  await Promise.all([p.waitForURL(/ok=/), p.click("button:has-text('Save relevance')")]);
  if (!/opened 1 new deal/i.test(decodeURIComponent(p.url()).replace(/\+/g, " "))) throw new Error(decodeURIComponent(p.url()));
});
ok("no server/JS errors", errs.length === 0); if (errs.length) console.log(errs.slice(0, 5));
await b.close(); process.exit(fails ? 1 : 0);
