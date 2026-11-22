import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const projId = process.argv[2];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
async function shoot(theme, viewport, pages, prefix) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "pip_theme", value: theme, url: base }]);
  const p = await ctx.newPage();
  await p.goto(base + "/login");
  if (prefix.includes("login")) { await p.waitForTimeout(800); await p.screenshot({ path: `test-artifacts/${prefix}.png` }); await ctx.close(); return; }
  await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
  await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);
  for (const [name, path] of pages) {
    await p.goto(base + path, { waitUntil: "networkidle" }); await p.waitForTimeout(name.includes("settled") ? 2500 : 1600);
    if (name === "project-hint") { await p.hover(".card#score .hint"); await p.waitForTimeout(250); }
    await p.screenshot({ path: `test-artifacts/${prefix}-${name}.png` });
  }
  await ctx.close();
}
await shoot("dark", { width: 1440, height: 900 }, [["overview", "/"], ["project-hint", `/projects/${projId}`], ["command", "/command"], ["network", "/companies"]], "dark");
await shoot("dark", { width: 1440, height: 900 }, [["today-settled", "/"]], "dark2");
await shoot("light", { width: 1440, height: 900 }, [["overview", "/"], ["project", `/projects/${projId}`], ["agents", "/agents"]], "light");
await shoot("light", { width: 390, height: 844 }, [["overview", "/"]], "mobile-light");
await shoot("dark", { width: 1280, height: 800 }, [], "dark-login");
await browser.close(); console.log("done");
