import { chromium, devices } from "playwright-core";
const base = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let fails = 0; const errs = []; const stamp = Date.now();
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };
const t = async (n, fn) => { try { await fn(); ok(n, true); } catch (e) { ok(`${n}: ${e.message.split("\n")[0]}`, false); } };
async function login(ctx) { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push("JS " + e.message.slice(0, 60))); p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123"); await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]); return p; }
const inView = (p) => p.evaluate(() => { const r = document.querySelector(".sidebar").getBoundingClientRect(); return r.right > 10 && getComputedStyle(document.querySelector(".sidebar")).visibility !== "hidden"; });
const settle = (p) => p.waitForTimeout(400);

// ── Phone (iPhone 13, touch) ──
const phone = await b.newContext({ ...devices["iPhone 13"] });
await phone.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const m = await login(phone);
await t("phone: menu starts closed", async () => { if (await inView(m)) throw new Error("open on load"); });
await t("phone: ☰ opens menu", async () => { await m.tap(".nav-open"); await settle(m); if (!(await inView(m))) throw new Error("did not open"); });
await m.screenshot({ path: "test-artifacts/phone-menu-open.png" });
await t("phone: tap outside closes", async () => { await m.touchscreen.tap(370, 400); await settle(m); if (await inView(m)) throw new Error("still open"); });
await t("phone: ✕ closes", async () => { await m.tap(".nav-open"); await settle(m); await m.tap(".nav-close"); await settle(m); if (await inView(m)) throw new Error("still open"); });
await t("phone: choosing a page closes it", async () => { await m.tap(".nav-open"); await settle(m); await Promise.all([m.waitForURL(/\/agenda/), m.tap(".nav a[href='/agenda']")]); await settle(m); if (await inView(m)) throw new Error("still open after navigating"); });
await t("phone: open/close 5 times in a row", async () => { for (let i = 0; i < 5; i++) { await m.tap(".nav-open"); await settle(m); if (!(await inView(m))) throw new Error("open " + i); await m.touchscreen.tap(370, 300); await settle(m); if (await inView(m)) throw new Error("close " + i); } });
await t("phone: page doesn't scroll behind open menu", async () => { await m.tap(".nav-open"); await settle(m); const o = await m.evaluate(() => getComputedStyle(document.body).overflow); await m.tap(".nav-close"); if (o !== "hidden") throw new Error(o); });
await m.goto(base + "/agenda?view=week"); await settle(m); await m.screenshot({ path: "test-artifacts/phone-agenda.png" });

// ── Desktop ──
const desk = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 });
await desk.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await login(desk);
await t("desktop: collapse sidebar to icons", async () => { await p.click(".nav-collapse"); await p.waitForTimeout(400); const w = await p.evaluate(() => document.querySelector(".sidebar").getBoundingClientRect().width); if (w > 90) throw new Error("width " + w); });
await t("desktop: collapse is remembered after reload", async () => { await p.reload(); const c = await p.evaluate(() => document.querySelector(".shell").classList.contains("nav-collapsed")); if (!c) throw new Error("not remembered"); });
await p.screenshot({ path: "test-artifacts/desktop-collapsed.png" });
await t("desktop: expand again", async () => { await p.click(".nav-collapse"); await p.waitForTimeout(400); const w = await p.evaluate(() => document.querySelector(".sidebar").getBoundingClientRect().width); if (w < 200) throw new Error("width " + w); });

// ── Tasks from the Agenda ──
const tomorrow = new Date(Date.now() + 4 * 3600e3 + 864e5).toISOString().slice(0, 10);
const title = `E2E Agenda task ${stamp}`;
await t("agenda: + Task on a day pre-fills the date", async () => {
  await p.goto(`${base}/agenda?view=week&d=${tomorrow}`);
  await Promise.all([p.waitForURL(/\/tasks\/new/), p.locator(".cal-col").filter({ has: p.locator(`a[href*='date=${tomorrow}']`) }).first().locator(".cal-add:has-text('+ Task')").click()]);
  const v = await p.inputValue("input[name=dueDate]"); if (v !== tomorrow) throw new Error("dueDate " + v);
  await p.fill("input[name=title]", title);
  await Promise.all([p.waitForURL(/\/agenda/), p.click("button[type=submit]:has-text('Create')")]);
});
await t("agenda: new task shows on that day", async () => { await p.locator(`.cal-chip:has-text('${title}')`).first().waitFor({ timeout: 5000 }); });
await p.waitForTimeout(500); await p.screenshot({ path: "test-artifacts/agenda-task.png" });
await t("agenda: clicking the task opens it and returns to the calendar", async () => {
  await Promise.all([p.waitForURL(/\/tasks\/.*\/edit/), p.locator(`.cal-chip:has-text('${title}')`).first().click()]);
  await Promise.all([p.waitForURL(/\/agenda/), p.click("button[type=submit]:has-text('Save')")]);
});
await t("agenda: tick marks it done and removes it", async () => {
  await p.locator(".cal-task").filter({ hasText: title }).locator(".cal-tick").first().click();
  await p.waitForFunction((tt) => ![...document.querySelectorAll(".cal-chip")].some((c) => c.textContent.includes(tt)), title, { timeout: 10000 });
});
await t("agenda: month view has +M / +T", async () => { await p.goto(base + "/agenda?view=month"); if (!(await p.locator(".cal-cell .add:has-text('+T')").count())) throw new Error("missing"); });
ok("no server/JS errors", errs.length === 0); if (errs.length) console.log(errs.slice(0, 5));
await b.close(); process.exit(fails ? 1 : 0);
