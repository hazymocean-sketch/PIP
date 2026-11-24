import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
await ctx.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await ctx.newPage(); const errs = []; let fails = 0; const stamp = Date.now();
p.on("dialog", (d) => d.accept());
p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
p.on("pageerror", (e) => errs.push("JS " + e.message.slice(0, 40) + " @ " + p.url()));
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };
const t = async (n, fn) => { try { await fn(); ok(n, true); } catch (e) { ok(`${n}: ${e.message.split("\n")[0]}`, false); } };
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

const name = `E2E Live Resort ${stamp}`;
await t("create project with a venture", async () => {
  await p.goto(base + "/projects/new"); await p.fill("input[name=name]", name); await p.fill("input[name=city]", "Ras Al Khaimah");
  const v = p.locator("input[name=ventureIds]").first(); if (await v.count()) await v.check();
  await Promise.all([p.waitForURL(/\/projects\/[0-9a-f-]{36}/), p.click("button[type=submit]:has-text('Create'), button[type=submit]:has-text('Save')")]);
});
await t("Projects list shows the row with Go live", async () => {
  await p.goto(base + "/projects?q=" + encodeURIComponent(name));
  await p.locator(".pl-row button.onair:has-text('Go live')").waitFor({ timeout: 5000 });
});
await t("Go live → Researching → Live with sources", async () => {
  await p.click(".pl-row button.onair");
  await p.locator(".pl-row button.onair.live").waitFor({ timeout: 30000 });
  await p.locator(".pl-note").waitFor({ timeout: 10000 });
  const note = await p.locator(".pl-note").textContent();
  if (!/source/.test(note)) throw new Error("no research note: " + note);
});
await p.waitForTimeout(1500); await p.addStyleTag({ content: ".onair.live i,.st.live i{animation:none!important;opacity:1!important}" });
await p.goto(base + "/projects"); await p.waitForTimeout(1500); await p.addStyleTag({ content: ".onair.live i,.st.live i{animation:none!important;opacity:1!important}" });
await p.screenshot({ path: "test-artifacts/live-projects.png" });
await t("Live filter shows it", async () => { await p.goto(base + "/projects?live=1&q=" + encodeURIComponent(name)); if ((await p.locator(".pl-row").count()) !== 1) throw new Error("not in Live filter"); });
await t("CRM shows its live deal", async () => {
  await p.goto(base + "/opportunities?q=" + encodeURIComponent(name));
  if ((await p.locator(".crm-row:not(.h)").count()) < 1) throw new Error("no deal in CRM");
});
await t("Mark lost needs a reason, then shows it", async () => {
  await p.locator(".crm-row:not(.h) summary:has-text('Lost')").first().click();
  await p.locator(".crm-row:not(.h) select[name=reason]").first().selectOption("Price");
  await p.locator(".crm-row:not(.h) input[name=reasonNote]").first().fill("12% above winner");
  await Promise.all([p.waitForURL(/ok=/), p.locator(".crm-row:not(.h) button:has-text('Mark as lost')").first().click()]);
  await p.goto(base + "/opportunities?status=lost&q=" + encodeURIComponent(name));
  const why = await p.locator(".crm-why").first().textContent();
  if (!/Price — 12% above winner/.test(why)) throw new Error("reason missing: " + why);
});
await t("KPIs show top lost reason", async () => { await p.goto(base + "/opportunities"); const k = await p.locator(".crm-kpis").textContent(); if (!/Price/.test(k)) throw new Error(k); });
await t("Re-open puts it back to live", async () => {
  await p.goto(base + "/opportunities?status=lost&q=" + encodeURIComponent(name));
  await Promise.all([p.waitForURL(/ok=/), p.locator("button:has-text('Re-open')").first().click()]);
});
await t("Monthly target set in Settings shows on CRM", async () => {
  await p.goto(base + "/settings/ventures");
  await p.locator("summary:has-text('Edit venture profile')").first().click(); const f = p.locator("input[name=monthlyTarget]").first(); await f.fill("500000");
  await Promise.all([p.waitForURL(/ok=/), f.locator("xpath=ancestor::form").locator("button[type=submit]").first().click()]);
  await p.goto(base + "/opportunities"); await p.locator(".crm-tg").waitFor({ timeout: 5000 });
});
await t("Won", async () => {
  await p.goto(base + "/opportunities?q=" + encodeURIComponent(name));
  await Promise.all([p.waitForURL(/ok=/), p.locator(".crm-row:not(.h) button:has-text('Won')").first().click()]);
});
await p.goto(base + "/opportunities?status=all"); await p.waitForTimeout(1500); await p.addStyleTag({ content: ".onair.live i,.st.live i{animation:none!important;opacity:1!important}" });
await p.screenshot({ path: "test-artifacts/live-crm.png" });
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(base + "/projects"); await p.waitForTimeout(1200); await p.screenshot({ path: "test-artifacts/live-projects-mobile.png" });
ok("no server/JS errors", errs.length === 0); if (errs.length) console.log(errs.slice(0, 5));
await b.close(); process.exit(fails ? 1 : 0);
