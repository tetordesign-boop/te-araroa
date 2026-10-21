// Screenshots of the site with the real map (run in GitHub Actions, which can reach the tile servers).
// Usage: node scripts/qa/shots.mjs <outdir> [only-prefix]
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// which views to take: all, or the ids starting with one of the prefixes in scripts/qa/only.txt (one per line)
const onlyFile = new URL("./only.txt", import.meta.url);
const [, , OUT = "/tmp/shots", only = process.env.ONLY ?? (existsSync(onlyFile) ? readFileSync(onlyFile, "utf8") : "")] = process.argv;
const prefixes = only.split(/[\s,]+/).filter(Boolean);
mkdirSync(OUT, { recursive: true });
// the address to photograph: the local dev server, or (scripts/qa/base.txt) the site as it is online
const baseFile = new URL("./base.txt", import.meta.url);
const BASE = process.env.BASE || (existsSync(baseFile) ? readFileSync(baseFile, "utf8").trim() : "") || "http://localhost:5173/";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const mobile = (dark, locale = "fr-FR") => ({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? "dark" : "light", locale, timezoneId: "Pacific/Auckland", userAgent: IPHONE });
const desktop = (dark) => ({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", locale: "fr-FR", timezoneId: "Pacific/Auckland" });
// a phone held sideways, and an iPad held upright (Safari on iPad says it is a Mac)
const sideways = () => ({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Pacific/Auckland", userAgent: IPHONE });
const tablet = () => ({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, locale: "fr-FR", timezoneId: "Pacific/Auckland" });

const grip = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.click(".sheet__grip"); await p.waitForTimeout(700); } };
/** wait until the map has loaded what it needs for the current view */
async function settle(p, extra = 1500, timeout = 40000) {
  await p.waitForFunction(() => { const m = window.__tm?.map; return !!m && !m.isMoving() && m.loaded() && m.areTilesLoaded(); }, null, { timeout, polling: 500 }).catch(() => {});
  await p.waitForTimeout(extra);
}
/** the switches a visitor would flip, without clicking (clicks are flaky while software WebGL keeps the page busy) */
const ui = (fn, arg) => (p) => p.evaluate(([fn, arg]) => { const u = window.__ui; return new Function("u", "arg", fn)(u, arg); }, [fn, arg]);
const half = ui("u.detent.value = 'half'");
const full = ui("u.detent.value = 'full'");
const tap = (sel) => (p) => p.evaluate((sel) => document.querySelector(sel)?.click(), sel);
// (claimCamera: the arrival flight must not take the camera back)
const camera = (p, c) => p.evaluate((c) => { window.__tm?.claimCamera(); window.__tm?.map.jumpTo(c); }, c);
const prefs = (v) => (p) => p.addInitScript((v) => { try { localStorage.setItem("map-prefs-v1", JSON.stringify(v)); } catch (_) {} }, v);
const click = (sel) => (p) => p.click(sel);
const wait = (ms) => (p) => p.waitForTimeout(ms);
const seq = (...fs) => async (p) => { for (const f of fs) await f(p); };
/** what the page says, for the log (probe: an expression evaluated in the page) */
const probe = async (p, s) => {
  if (!s.probe) return "";
  const v = await p.evaluate((x) => { try { return String(new Function(`return (${x})`)() ?? ""); } catch (e) { return `probe failed: ${e}`; } }, s.probe).catch((e) => `probe failed: ${e}`);
  return `\n  SAYS ${v.replace(/\s*\n\s*/g, " / ").slice(0, 1500)}`;
};


const shots = JSON.parse(process.env.SHOTS_JSON || "null") ?? [
  { id: "m-intro", ctx: mobile(false), url: "?mock&intro", intro: true },
  { id: "d-intro", ctx: desktop(false), url: "?mock&intro", intro: true },
  { id: "m-home-peek", ctx: mobile(false), url: "?mock" },
  { id: "m-home-half", ctx: mobile(false), url: "?mock", act: half },
  { id: "m-home-full", ctx: mobile(false), url: "?mock", act: seq(full, wait(800), (p) => p.evaluate(() => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = 520; })) },
  { id: "m-day-half", ctx: mobile(false), url: "?mock#/jour/12" },
  { id: "m-place-hut", ctx: mobile(false), url: "?mock#/lieu/w1133817447" },
  { id: "m-place-pass", ctx: mobile(false), url: "?mock#/lieu/n527531217" },
  { id: "m-place-gap", ctx: mobile(false), url: "?mock#/lieu/gap-rakaia" },
  { id: "m-orbit", ctx: mobile(false), url: "?mock#/lieu/n5697804356", act: seq(tap(".place .action"), wait(9000)), noSettle: true },
  { id: "m-explore", ctx: mobile(false), url: "?mock#/explorer" },
  { id: "m-search", ctx: mobile(false), url: "?mock#/explorer", act: seq((p) => p.fill(".search input", "saddle"), wait(1500)) },
  { id: "m-search-map", ctx: mobile(false), url: "?mock#/explorer", act: seq((p) => p.fill(".search input", "hut"), wait(2500), ui("u.detent.value = 'peek'"), wait(1500)) },
  { id: "m-modes", ctx: mobile(false), url: "?mock", act: seq(ui("u.modesOpen.value = true"), wait(800)), noSettle: true },
  { id: "m-alps-3d", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [172.62, -42.13], zoom: 11.6, pitch: 62, bearing: 160 }) },
  { id: "m-pois-close", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [172.73, -42.0], zoom: 12.6, pitch: 50, bearing: 190 }) },
  { id: "m-lakes", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [170.38, -44.05], zoom: 9.3, pitch: 50, bearing: 15 }) },
  { id: "m-island", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [171.6, -43.4], zoom: 5.4, pitch: 0, bearing: 0 }) },
  { id: "m-satellite", ctx: mobile(false), url: "?mock", pre: prefs({ base: "satellite", contours: true, sun: false }), act: (p) => camera(p, { center: [172.62, -42.13], zoom: 11.6, pitch: 62, bearing: 160 }) },
  { id: "m-eye", ctx: mobile(false), url: "?mock", act: seq(wait(4000), ui("u.startEyeView()"), wait(11000)) },
  { id: "m-trail", ctx: mobile(false), url: "?mock", act: seq(wait(4000), ui("u.startTrailMode(348)"), wait(10000)), noSettle: true },
  { id: "m-trail-tekapo", ctx: mobile(false), url: "?mock", act: seq(wait(4000), ui("u.startTrailMode(700)"), wait(2500), ui("document.querySelector('.trail-hud__play')?.click()"), wait(9000)), noSettle: true },
  { id: "d-home", ctx: desktop(false), url: "?mock" },
  { id: "d-place-peak", ctx: desktop(false), url: "?mock#/lieu/n5697804356" },
  { id: "d-explore-search", ctx: desktop(false), url: "?mock#/explorer", act: seq((p) => p.fill(".search input", "hut"), wait(2500)) },
  { id: "d-aoraki", ctx: desktop(false), url: "?mock", act: (p) => camera(p, { center: [170.2, -43.75], zoom: 10.4, pitch: 60, bearing: 300 }) },
  { id: "d-sun", ctx: desktop(false), url: "?mock", pre: prefs({ base: "explore", contours: true, sun: true }), act: (p) => camera(p, { center: [172.62, -42.13], zoom: 11.2, pitch: 60, bearing: 160 }) },
  { id: "d-eye", ctx: desktop(false), url: "?mock", act: seq(wait(4000), ui("u.startEyeView()"), wait(11000)) },
  { id: "d-trail", ctx: desktop(false), url: "?mock", act: seq(wait(4000), ui("u.startTrailMode(348)"), wait(10000)), noSettle: true },
  { id: "d-lakes", ctx: desktop(false), url: "?mock", act: (p) => camera(p, { center: [169.2, -44.62], zoom: 9.4, pitch: 58, bearing: 330 }) },
  { id: "d-day", ctx: desktop(false), url: "?mock#/jour/14" },
  { id: "l-intro", ctx: sideways(), url: "?mock&intro", intro: true },
  { id: "l-home", ctx: sideways(), url: "?mock" },
  { id: "l-day", ctx: sideways(), url: "?mock#/jour/12" },
  { id: "t-home", ctx: tablet(), url: "?mock" },
  { id: "t-day", ctx: tablet(), url: "?mock#/jour/12" },
  // the real site, with the real database (what family and friends see today)
  { id: "r-m-intro", ctx: mobile(false), url: "?intro", intro: true, probe: "document.querySelector('.intro')?.innerText" },
  { id: "r-m-intro-en", ctx: mobile(false, "en-NZ"), url: "?intro", intro: true, probe: "document.querySelector('.intro')?.innerText" },
  { id: "r-m-home", ctx: mobile(false), url: "", probe: "document.querySelector('.sheet')?.innerText" },
  { id: "r-m-home-half", ctx: mobile(false), url: "", act: half },
  { id: "r-m-home-full", ctx: mobile(false), url: "", act: seq(full, wait(800)) },
  { id: "r-m-home-full-2", ctx: mobile(false), url: "", act: seq(full, wait(800), (p) => p.evaluate(() => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = 640; })) },
  { id: "r-m-about", ctx: mobile(false), url: "#/apropos", act: full },
  { id: "r-m-explore", ctx: mobile(false), url: "#/explorer" },
  { id: "r-m-journal", ctx: mobile(false), url: "#/journal", probe: "document.querySelector('.sheet')?.innerText" },
  { id: "r-m-carnet", ctx: mobile(false), url: "admin/", plain: 6000, probe: "document.body.innerText" },
  { id: "r-d-intro", ctx: desktop(false), url: "?intro", intro: true },
  { id: "r-d-home", ctx: desktop(false), url: "", probe: "document.querySelector('.sheet, .panel')?.innerText" },
  // the site online (with base.txt): no developer hooks there, so plain waits
  { id: "p-m-intro", ctx: mobile(false), url: "?intro", intro: true, probe: "document.querySelector('.intro')?.innerText" },
  { id: "p-m-home", ctx: mobile(false), url: "", plain: 16000, probe: "document.querySelector('.sheet')?.innerText" },
  { id: "p-l-home", ctx: sideways(), url: "", plain: 16000 },
  { id: "p-t-home", ctx: tablet(), url: "", plain: 16000 },
  { id: "p-d-home", ctx: desktop(false), url: "", plain: 16000, probe: "[...document.querySelectorAll('link[rel=preload]')].map((l) => l.href.split('/').pop()).join(' ') + ' | fonts ' + document.fonts.check('860 100px \"Archivo Variable\"')" },
  { id: "p-m-carnet", ctx: mobile(false), url: "admin/", plain: 6000, probe: "document.body.innerText" },
];

const log = [];
const started = Date.now();
for (const s of shots) {
  if (prefixes.length && !prefixes.some((x) => s.id.startsWith(x))) continue;
  if (Date.now() - started > 34 * 60_000) { const l = `${s.id} skipped (time budget)`; console.log(l); log.push(l); continue; }
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  let status = "ok";
  let info = "";
  const marks = [];
  const mark = (name) => marks.push(`${name} ${Math.round((Date.now() - t0) / 100) / 10}s`);
  try {
    if (s.pre) await s.pre(page);
    // the presentation shows on a first visit only: these are return visits (except the presentation's own shots)
    if (!s.intro) await page.addInitScript(() => { try { localStorage.setItem("intro-v1", "1"); } catch (_) {} });
    await page.goto(BASE + s.url, { waitUntil: "domcontentloaded" });
    if (s.intro || s.plain) {
      // the presentation sways and its light runs: it never goes idle, so no settling, just time for the tiles
      // (plain: a page without the map, the Carnet)
      await page.waitForTimeout(s.plain ?? 14000); mark("waited");
      await page.screenshot({ path: `${OUT}/${s.id}.png`, timeout: 120000 });
      const info = await probe(page, s);
      const line = `${s.id} ${Date.now() - t0}ms ok [${marks.join(", ")}]${errs.length ? " ERR " + [...new Set(errs)].slice(0, 5).join(" | ") : ""}${info}`;
      console.log(line); log.push(line);
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(3000);
    await settle(page, 800); mark("settled");
    // the arrival (trail drawing in, then the flight to Ewan) runs first on the plain map
    await page.waitForFunction(() => window.__ui?.arrival?.value === null, null, { timeout: 15000, polling: 300 }).catch(() => {});
    mark("arrived");
    await settle(page, 600); mark("settled");
    if (s.act) { await s.act(page); mark("acted"); if (!s.noSettle) { await settle(page, 1800); mark("settled"); } }
    await page.screenshot({ path: `${OUT}/${s.id}.png`, timeout: 120000 });
    info = await probe(page, s);
  } catch (e) {
    status = `FAIL ${String(e.message || e).split("\n")[0]}`;
    await page.screenshot({ path: `${OUT}/${s.id}.png`, timeout: 120000 }).catch(() => {});
  }
  const line = `${s.id} ${Date.now() - t0}ms ${status} [${marks.join(", ")}]${errs.length ? " ERR " + [...new Set(errs)].slice(0, 5).join(" | ") : ""}${info}`;
  console.log(line); log.push(line);
  await ctx.close();
}
writeFileSync(`${OUT}/log.txt`, log.join("\n") + "\n");
await browser.close();
