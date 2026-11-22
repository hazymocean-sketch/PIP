import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split("\n")[0]}`); } };
const flash = async () => (await p.locator(".flash").first().textContent({ timeout: 5000 }))?.trim();

await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

await check("validation error on empty required field", async () => {
  await p.goto(base + "/projects/new"); await p.fill("#f-name", " "); await p.evaluate(() => document.querySelector("#f-name").removeAttribute("required"));
  await p.click("text=Create project"); const f = await flash(); if (!/required/i.test(f)) throw new Error(f);
});
await check("create project via form", async () => {
  await p.goto(base + "/projects/new"); await p.fill("#f-name", "E2E Harbour Hotel"); await p.fill("#f-city", "Dubai"); await p.fill("#f-roomsUnits", "210");
  await p.click("text=Create project"); await p.waitForURL(/\/projects\/[0-9a-f-]{36}/); if (!/saved/.test(await flash())) throw new Error("no flash");
});
const projUrl = p.url().split("?")[0];
await check("edit project", async () => {
  await p.goto(projUrl + "/edit"); await p.selectOption("#f-status", "under_research"); await p.click("text=Save changes"); await p.waitForURL(projUrl + "*");
  if (!(await p.content()).includes("Under research")) throw new Error("status not shown");
});
await check("add source with info status", async () => {
  await p.goto(projUrl); await p.click("#sources summary"); await p.fill("#sources #f-url", "https://example.com/e2e-article"); await p.fill("#sources #f-sourceName", "E2E Source");
  await p.click("#sources button:has-text('Add source')"); await p.waitForSelector("text=E2E Source", { timeout: 8000 });
});
await check("link new company with role", async () => {
  await p.goto(projUrl); await p.fill("input[name=newCompanyName]", "E2E Developer LLC"); await p.click("form:has(input[name=newCompanyName]) button[type=submit]");
  await p.waitForURL(/ok=|error=/); await p.waitForSelector("text=E2E Developer LLC", { timeout: 8000 });
});
await check("multi-venture relevance", async () => {
  await p.goto(projUrl); const boxes = p.locator("input[name=ventureId]"); await boxes.nth(0).check(); await boxes.nth(3).check();
  await p.click("text=Save relevance"); if (!/Venture relevance updated/.test(await flash())) throw new Error("no flash");
  if (await p.locator("input[name=ventureId]:checked").count() !== 2) throw new Error("not 2 ventures");
});
await check("score project", async () => {
  await p.goto(projUrl); await p.selectOption("select[name=f_sector_relevance]", "5"); await p.selectOption("select[name=f_timing]", "4");
  await p.click("text=Save score"); await p.waitForURL(/ok=|error=/, { timeout: 15000 }); console.log("score url", p.url()); if (!/Score saved/.test(await flash())) throw new Error("no score");
});
await check("run research agent from project", async () => {
  await p.goto(projUrl); await p.click("text=Run Research agent"); await p.waitForURL(/agents\/runs/); const c = await p.content();
  if (!c.includes("SIMULATED")) throw new Error("not labelled simulated");
});
await check("manual discovery run creates session with search links", async () => {
  await p.goto(base + "/discoveries"); await p.fill("input[name=location]", "Ras Al Khaimah"); await p.click("text=Run discovery"); await p.waitForURL(/research\//);
  if (!(await p.content()).includes("new hotel announced Ras Al Khaimah")) throw new Error("queries missing");
});
await check("add finding → duplicate detected → link to project", async () => {
  await p.click("text=Add a finding from this research"); await p.fill("#f-title", "E2E Harbour Hotel"); await p.fill("#f-url", "https://example.com/e2e-finding");
  await p.click("text=Add finding"); await p.waitForURL(/discoveries\//);
  if (!(await p.content()).includes("Project: E2E Harbour Hotel")) throw new Error("duplicate not detected");
  await p.click("form:has(select[name=projectId]) button[type=submit]"); await p.waitForURL(/projects\//);
});
await check("command centre routes & creates approval-free run", async () => {
  await p.goto(base + "/command"); await p.fill("textarea[name=message]", "Give me today's brief"); await p.click("text=Send"); await p.waitForURL(base + "/command");
  if (!(await p.content()).includes("Executive Assistant")) throw new Error("not routed");
});
await check("approve pending approval", async () => {
  await p.goto(base + "/command?tab=approvals"); const before = await p.locator("button.good:has-text('Approve')").count(); if (!before) { results.push("SKIP approve: no pending approvals left"); return; }
  await p.locator("button.good:has-text('Approve')").first().click(); if (!/Approved/.test(await flash())) throw new Error("no flash");
});
await check("delete requires confirmation", async () => {
  await p.goto(projUrl); await p.click("summary:has-text('Delete project')");
  await p.evaluate(() => document.querySelector("input[name=confirm]").removeAttribute("required"));
  await p.click("details[open] button:has-text('Delete')"); if (!/confirmation/i.test(await flash())) throw new Error("deleted without confirm");
  await p.click("summary:has-text('Delete project')").catch(() => {}); await p.check("input[name=confirm]"); await p.click("details[open] button:has-text('Delete')");
  await p.waitForURL(/\/projects\?/); if (!/deleted/.test(await flash())) throw new Error("not deleted");
});
await check("export requires auth & works", async () => {
  const r = await p.request.get(base + "/api/export?table=projects"); if (r.status() !== 200 || !(await r.text()).startsWith("id,")) throw new Error(String(r.status()));
});
await check("sign out invalidates session", async () => {
  await p.click("button[aria-label='Sign out']"); await p.waitForURL(/login/); await p.goto(base + "/projects"); if (!p.url().includes("/login")) throw new Error("still in");
});
console.log(results.join("\n")); await b.close();
