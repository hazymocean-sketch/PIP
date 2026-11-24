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
const still = () => p.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

const name = `E2E Pipeline Resort ${stamp}`;
await t("project with 2 ventures goes live", async () => {
  await p.goto(base + "/projects/new"); await p.fill("input[name=name]", name); await p.fill("input[name=city]", "Ras Al Khaimah");
  await Promise.all([p.waitForURL(/\/projects\/[0-9a-f-]{36}/), p.click("button[type=submit]:has-text('Create')")]);
  const boxes = p.locator("input[type=checkbox][name=ventureId]"); await boxes.nth(0).check(); await boxes.nth(1).check();
  await Promise.all([p.waitForURL(/ok=/), p.click("button:has-text('Save relevance')")]);
  await p.goto(base + "/projects?q=" + encodeURIComponent(name)); await p.click(".pl-row button.onair");
  await p.locator(".pl-row button.onair.live").waitFor({ timeout: 30000 });
});
await t("CRM project click opens its pipeline", async () => {
  await p.goto(base + "/opportunities?q=" + encodeURIComponent(name));
  await Promise.all([p.waitForURL(/\/pipeline\?project=/), p.locator(".crm-row:not(.h) a.p").first().click()]);
  const n = await p.locator(".deal").count(); if (n < 1) throw new Error("no deals"); console.log("   deals on project:", n);
});
await t("move deal to stage 3", async () => {
  await p.locator(".deal").first().locator("button.stg").nth(1).click();
  await p.waitForFunction(() => document.querySelector(".deal .stg.current .n")?.textContent === "03", null, { timeout: 10000 });
  const here = await p.locator(".deal").first().locator(".stg.current .l").textContent(); console.log("   now at:", here);
});
await still(); await p.waitForTimeout(800); await p.screenshot({ path: "test-artifacts/pipeline-project.png" });
await t("Lost asks for a reason, then shows it", async () => {
  const d = p.locator(".deal").first(); await d.locator("details.stg summary").click();
  await d.locator("select[name=reason]").selectOption("Timing / project delayed");
  await d.locator("button:has-text('Mark as lost')").click();
  await p.waitForFunction(() => [...document.querySelectorAll(".deal .stg.current.lost")].some((e) => /Timing/.test(e.textContent ?? "")), null, { timeout: 10000 });
});
await t("move back into play re-opens", async () => {
  await p.locator(".deal:has(.stg.current.lost)").first().locator("button.stg").first().click();
  await p.waitForFunction(() => !document.querySelector(".deal .stg.current.lost"), null, { timeout: 10000 });
});
await t("Pipeline heading in sidebar opens all live deals", async () => {
  await Promise.all([p.waitForURL(/\/pipeline$/), p.click("a.nav-group:has-text('Pipeline')")]);
});
await still(); await p.waitForTimeout(800); await p.screenshot({ path: "test-artifacts/pipeline-all.png" });

await t("Agenda: plan a meeting tomorrow 10:30", async () => {
  const tomorrow = new Date(Date.now() + 4 * 3600e3 + 864e5).toISOString().slice(0, 10);
  await p.goto(`${base}/meetings/new?date=${tomorrow}&time=10:30`);
  await p.fill("input[name=title]", `E2E Meeting ${stamp}`); await p.fill("input[name=location]", "Site office");
  await Promise.all([p.waitForURL(/\/agenda/), p.click("button[type=submit]:has-text('Create')")]);
  await p.goto(`${base}/agenda?view=week&d=${tomorrow}`);
  const chip = p.locator(`.cal-chip:has-text('E2E Meeting ${stamp}')`); await chip.waitFor({ timeout: 5000 });
  const tm = await chip.locator(".tm").textContent(); if (tm !== "10:30") throw new Error("time shown " + tm);
});
await still(); await p.waitForTimeout(800); await p.screenshot({ path: "test-artifacts/agenda-week.png" });
await t("Agenda month & day views render", async () => {
  await p.goto(base + "/agenda?view=month"); if ((await p.locator(".cal-cell").count()) !== 42) throw new Error("month grid");
  await still(); await p.waitForTimeout(600); await p.screenshot({ path: "test-artifacts/agenda-month.png" });
  await p.goto(base + "/agenda?view=day"); await p.locator(".cal-hour").first().waitFor();
});
await t("Edit meeting keeps Dubai time", async () => {
  const tomorrow = new Date(Date.now() + 4 * 3600e3 + 864e5).toISOString().slice(0, 10);
  await p.goto(`${base}/agenda?view=day&d=${tomorrow}`); await p.click(`.cal-chip:has-text('E2E Meeting ${stamp}')`);
  const v = await p.inputValue("input[name=startsAt]"); if (!v.endsWith("10:30")) throw new Error(v);
});
ok("no server/JS errors", errs.length === 0); if (errs.length) console.log(errs.slice(0, 5));
await b.close(); process.exit(fails ? 1 : 0);
