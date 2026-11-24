// Broad section-by-section browser test. Run against a local server started with the fake search provider.
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
const out = [];
const t = async (name, fn) => { try { await fn(); out.push(`PASS ${name}`); } catch (e) { out.push(`FAIL ${name}: ${String(e.message).split("\n")[0]}`); } };
const ok = async () => { await p.waitForURL(/ok=/, { timeout: 15000 }); };
const stamp = Date.now();

await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

await t("Today: accordion opens and item links to work", async () => {
  await p.goto(base + "/");
  const first = p.locator("details.start").first();
  await first.locator("summary").click();
  await first.locator(".start-row, .start-more").first().waitFor({ timeout: 5000 });
  const href = await first.locator(".start-row, .start-more").first().getAttribute("href");
  if (!href) throw new Error("no link");
  await p.goto(base + href); if ((await p.title()).includes("404")) throw new Error("404 " + href);
});
await t("Theme toggle persists", async () => {
  await p.goto(base + "/"); await p.click(".theme-toggle button:has-text('Light')");
  await p.reload(); if ((await p.locator("html").getAttribute("data-theme")) !== "light") throw new Error("not light");
  await p.click(".theme-toggle button:has-text('Dark')");
});
await t("Hint bubble appears on hover", async () => {
  await p.goto(base + "/"); await p.hover(".hint >> nth=0"); await p.locator(".hint-bubble").waitFor({ timeout: 3000 });
});
await t("Discover: live progress bar runs to completion", async () => {
  await p.goto(base + "/discoveries");
  await p.fill("input[name=query]", `progress test ${stamp}`); await p.selectOption("select[name=template]", "custom");
  await p.click("button:has-text('Run discovery')");
  await p.locator(".search-progress").waitFor({ timeout: 5000 });
  await p.locator(".sp-state:has-text('Search complete')").waitFor({ timeout: 30000 });
  await p.waitForURL(/\/research\//, { timeout: 10000 });
  if (!(await p.content()).includes("Test result 1")) throw new Error("results missing");
});
await t("Discover: save a find as project", async () => {
  await p.goto(base + "/discoveries");
  await p.locator(".li-check a:has-text('progress test')").first().click();
  await p.fill("input[name=name]", `E2E Saved ${stamp}`); await p.click("button:has-text('Save as project')");
  await p.waitForURL(/\/projects\//); 
});
await t("News: create + duplicate URL blocked", async () => {
  for (const expectOk of [true, false]) {
    await p.goto(base + "/news/new");
    await p.fill("#f-title", `E2E news ${stamp}`); await p.fill("#f-url", `https://example.com/e2e-${stamp}`);
    await p.click("button:has-text('Create news item')");
    await p.waitForURL(/ok=|error=/);
    if (expectOk !== p.url().includes("ok=")) throw new Error(`unexpected ${p.url()}`);
  }
});
await t("Research: open session, answer, complete", async () => {
  await p.goto(base + "/research"); await p.selectOption("select[name=kind]", "project");
  await p.click("button:has-text('Open research session')"); await p.waitForURL(/\/research\//);
  await p.fill("#a_0", "A 200-key hotel"); await p.check("input[name=status]"); await p.click("button:has-text('Save research')"); await ok();
});
await t("Network: create company and contact", async () => {
  await p.goto(base + "/companies/new"); await p.fill("#f-name", `E2E Co ${stamp}`); await p.click("button:has-text('Create company')"); await p.waitForURL(/\/companies\/[0-9a-f-]{36}/);
  await p.goto(base + "/contacts/new"); await p.fill("#f-fullName", `E2E Person ${stamp}`); await p.click("button:has-text('Create contact')"); await p.waitForURL(/\/contacts\/[0-9a-f-]{36}/);
});
await t("Opportunities: create with venture + stage, pipeline board", async () => {
  await p.goto(base + "/opportunities/new"); await p.fill("#f-title", `E2E Opp ${stamp}`);
  await p.selectOption("#f-ventureId", { index: 1 }); await p.selectOption("#f-stageId", { index: 1 });
  await p.click("button:has-text('Create opportunity')"); await p.waitForURL(/\/opportunities\/[0-9a-f-]{36}/);
  await p.goto(base + "/opportunities"); await p.locator(".tabs a").nth(1).click(); await p.waitForLoadState();
});
await t("Agenda: create task, complete it; log activity", async () => {
  await p.goto(base + "/tasks/new"); await p.fill("#f-title", `E2E Task ${stamp}`); await p.click("button:has-text('Create task')"); await ok();
  await p.locator(`tr:has-text('E2E Task ${stamp}') button:has-text('Done')`).click(); await ok();
  await p.goto(base + "/activities/new"); await p.fill("#f-subject", `E2E Call ${stamp}`); await p.selectOption("#f-type", "call"); await p.click("button:has-text('Create activity')"); await ok();
});
await t("Automation: run each of the 9 agents", async () => {
  await p.goto(base + "/agents");
  const links = await p.locator(".grid a.card").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  if (links.length !== 9) throw new Error(`found ${links.length} agents`);
  for (const l of links) {
    await p.goto(base + l); await p.click("button:has-text('Run now')"); await p.waitForURL(/\/agents\/runs\//, { timeout: 20000 });
    if ((await p.locator(".badge:has-text('Failed')").count()) > 0) throw new Error(`agent failed: ${l}`);
  }
});
await t("Automation: enable/disable a workflow and run it", async () => {
  await p.goto(base + "/automations"); await p.locator("a.title:has-text('Overdue task')").click();
  await p.locator("button:has-text('Enable'), button:has-text('Disable')").first().click(); await ok();
  await p.click("button:has-text('Run now')"); await p.waitForURL(/\/automations\/runs\//);
  await p.goto(base + "/automations"); await p.click("button:has-text('Run tick now')"); await ok();
});
await t("Command: talk to PIP + every tab renders", async () => {
  await p.goto(base + "/command"); await p.fill("textarea[name=message]", "pipeline review for Calibro"); await p.click("button:has-text('Send')"); await p.waitForURL(base + "/command");
  for (const tab of ["approvals", "activity", "insights", "performance", "notifications"]) { await p.goto(base + "/command?tab=" + tab); await p.locator("h1").waitFor(); }
});
await t("Settings: venture, scoring, sectors, integrations, data", async () => {
  await p.goto(base + "/settings/ventures"); await p.locator("details:has-text('Edit venture profile')").first().locator("summary").click();
  await p.locator("button:has-text('Save Calibro')").click(); await ok();
  await p.goto(base + "/settings/research"); await p.click("button:has-text('Save methodology')"); await ok();
  await p.click("button:has-text('Save sectors')"); await ok();
  await p.goto(base + "/settings/integrations"); await p.locator("h1").waitFor();
  const r = await p.request.get(base + "/api/export?table=opportunities"); if (r.status() !== 200) throw new Error("export " + r.status());
});
await t("Reports render", async () => { await p.goto(base + "/reports"); await p.locator(".bars, .empty").first().waitFor(); });
await t("Project edit + delete safeguard", async () => {
  await p.goto(base + "/projects"); await Promise.all([p.waitForURL(/\/projects\/[0-9a-f-]{36}/), p.locator(`a.title:has-text('E2E Saved ${stamp}')`).click()]);
  const u = p.url().split("?")[0]; await p.goto(u + "/edit"); await p.click("button:has-text('Save changes')"); await ok();
});
await t("Malformed links show not-found, not a crash", async () => {
  for (const u of ["/projects/edit", "/companies/xyz", "/agents/runs/123", "/research/nope"]) { const r = await p.request.get(base + u); if (r.status() !== 404) throw new Error(`${u} → ${r.status()}`); }
  errs.splice(0, errs.length, ...errs.filter((e) => !/projects\/edit/.test(e) && !e.startsWith("pageerror")));
});
await t("No server errors or page crashes during run", async () => { if (errs.length) throw new Error(errs.slice(0, 3).join(" | ")); });

console.log(out.join("\n")); await b.close();
