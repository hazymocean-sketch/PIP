import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
async function shoot(viewport, pages, prefix) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(base + "/login");
  await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
  await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);
  for (const [name, path] of pages) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.screenshot({ path: `test-artifacts/${prefix}-${name}.png`, fullPage: false });
  }
  await ctx.close();
}
const projId = process.argv[2];
await shoot({ width: 1440, height: 900 }, [["overview", "/"], ["command", "/command"], ["approvals", "/command?tab=approvals"], ["project", `/projects/${projId}`], ["discoveries", "/discoveries"], ["agents", "/agents"], ["opps", "/opportunities"]], "desktop");
await shoot({ width: 390, height: 844 }, [["overview", "/"], ["project", `/projects/${projId}`], ["command", "/command"]], "mobile");
// login page
const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await c.newPage(); await pg.goto(base + "/login"); await pg.screenshot({ path: "test-artifacts/desktop-login.png" });
await browser.close();
console.log("done");
