// Screenshots of the site with the real map (run in GitHub Actions, which can reach the tile servers).
// Usage: node scripts/qa/shots.mjs <outdir> [only-prefix]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [, , OUT = "/tmp/shots", only = process.env.ONLY ?? ""] = process.argv;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://localhost:5173/";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const mobile = (dark, locale = "fr-FR") => ({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? "dark" : "light", locale, timezoneId: "Pacific/Auckland", userAgent: IPHONE });
const desktop = (dark) => ({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", locale: "fr-FR", timezoneId: "Pacific/Auckland" });

const grip = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.click(".sheet__grip"); await p.waitForTimeout(700); } };
const scrollSheet = (p, y) => p.evaluate((y) => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = y; }, y);
/** wait until the map has loaded what it needs for the current view */
async function settle(p, extra = 1500) {
  await p.waitForFunction(() => { const m = window.__tm?.map; return !!m && m.loaded() && m.areTilesLoaded(); }, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(extra);
}
const camera = (p, c) => p.evaluate((c) => window.__tm?.map.jumpTo(c), c);

const shots = JSON.parse(process.env.SHOTS_JSON || "null") ?? [
  { id: "m-home-peek", ctx: mobile(false), url: "?mock" },
  { id: "m-home-half", ctx: mobile(false), url: "?mock", act: (p) => grip(p, 1) },
  { id: "m-day-half", ctx: mobile(false), url: "?mock#/jour/12" },
  { id: "m-dark-day-half", ctx: mobile(true), url: "?mock#/jour/5" },
  { id: "m-alps-3d", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [172.62, -42.13], zoom: 11.6, pitch: 62, bearing: 160 }) },
  { id: "d-home", ctx: desktop(false), url: "?mock" },
  { id: "d-day", ctx: desktop(false), url: "?mock#/jour/12" },
  { id: "d-nelson-lakes", ctx: desktop(false), url: "?mock", act: (p) => camera(p, { center: [172.75, -42.0], zoom: 11.2, pitch: 55, bearing: 200 }) },
  { id: "d-aoraki", ctx: desktop(false), url: "?mock", act: (p) => camera(p, { center: [170.2, -43.75], zoom: 10.4, pitch: 60, bearing: 300 }) },
  { id: "d-dark-home", ctx: desktop(true), url: "?mock" },
];

const log = [];
for (const s of shots) {
  if (only && !s.id.startsWith(only)) continue;
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  await page.goto(BASE + s.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await settle(page, 800);
  if (s.act) { await s.act(page); await settle(page, 1800); }
  await page.screenshot({ path: `${OUT}/${s.id}.png` });
  const line = `${s.id} ${Date.now() - t0}ms ${errs.length ? "ERR " + [...new Set(errs)].slice(0, 5).join(" | ") : "ok"}`;
  console.log(line); log.push(line);
  await ctx.close();
}
writeFileSync(`${OUT}/log.txt`, log.join("\n") + "\n");
await browser.close();
