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
/** reload while listening: the REST answers (status, table or function) and the realtime replies (status, topic) */
const watchData = async (p) => {
  const log = [];
  p.on("response", (r) => { const u = r.url(); if (u.includes("/rest/v1/")) log.push(`${r.status()} ${u.split("/rest/v1/")[1].split("?")[0]}`); });
  p.on("websocket", (ws) => {
    log.push(`ws open ${ws.url().split("?")[0].split("/").slice(-2).join("/")}`);
    ws.on("framereceived", (f) => { const t = String(f.payload); if (t.includes("phx_reply")) log.push(`ws reply ${(t.match(/"status":"(\w+)"/) || [])[1] || "?"} ${(t.match(/"topic":"([^"]+)"/) || [])[1] || ""}`); });
  });
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.push(`console ${m.type()}: ${m.text().slice(0, 140)}`); });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(14000);
  await p.evaluate((l) => { window.__qa = l.join(" | "); }, log);
};
/** the journal's albums (the shelf of sections) at the top of the sheet */
const toShelf = (p) => p.evaluate(() => {
  const b = document.querySelector(".sheet__body"), h = document.querySelector(".shelf-head");
  if (b && h) b.scrollTop += h.getBoundingClientRect().top - b.getBoundingClientRect().top - 12;
});
/**
 * The Carnet with no network: a second visit under the service worker, then the network cut and the page opened
 * again. What it says goes to window.__qa.
 * Not proof on its own: the browser's offline switch (and request blocking) doesn't cut the service worker off, which
 * still reaches the network. The real test stops the server (see the November 2026 fix in public/sw.js): a first
 * visit, the server stopped, the page opened again.
 */
const carnetOffline = async (p) => {
  // (the development server registers no service worker: "ready" would never come, and the run waited until its limit)
  await p.evaluate(() => Promise.race([navigator.serviceWorker?.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]));
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(5000);
  await p.context().setOffline(true);
  const status = await p.reload({ waitUntil: "load", timeout: 20000 }).then((r) => r?.status() ?? "no response", (e) => `reload failed: ${e.message.split("\n")[0]}`);
  await p.waitForTimeout(5000);
  await p.evaluate((st) => {
    window.__qa = `reload offline: ${st} | navigator.onLine ${navigator.onLine} | worker ${!!navigator.serviceWorker?.controller} | ${document.body.innerText.replace(/\s+/g, " ").slice(0, 220)}`;
  }, status);
};

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
  { id: "m-shops-wanaka", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [169.137, -44.697], zoom: 15, pitch: 30, bearing: 0 }) },
  { id: "m-shops-arthurs", ctx: mobile(false), url: "?mock", act: (p) => camera(p, { center: [171.57, -42.955], zoom: 12.4, pitch: 45, bearing: 180 }) },
  { id: "m-place-shop", ctx: mobile(false), url: "?mock#/lieu/w297010449", probe: "document.querySelector('.place')?.innerText" },
  { id: "m-home-resupply", ctx: mobile(false), url: "?mock", act: seq(full, wait(800)), probe: "[...document.querySelectorAll('.next')].map((x) => x.innerText.replace(/\\n/g, ' / ')).join(' || ')" },
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
  { id: "r-m-pack", ctx: mobile(false), url: "#/sac", act: full, probe: "document.querySelector('.sheet')?.innerText" },
  { id: "r-m-pack-en", ctx: mobile(false, "en-NZ"), url: "#/sac", act: full, probe: "document.querySelector('.sheet')?.innerText" },
  { id: "r-m-journal", ctx: mobile(false), url: "#/journal", probe: "document.querySelector('.sheet')?.innerText" },
  { id: "r-m-carnet", ctx: mobile(false), url: "admin/", plain: 6000, probe: "document.body.innerText" },
  // the sponsors: the coins on the map (real logos), the page of tickets, the way back from Stripe
  { id: "r-m-spin", ctx: mobile(false), url: "", act: seq(wait(3000), (p) => p.waitForSelector(".spin", { timeout: 20000 }).catch(() => {}), wait(2500)),
    probe: "JSON.stringify([...document.querySelectorAll('.spin')].map((e) => ({ cls: e.className, r: [e.getBoundingClientRect().left, e.getBoundingClientRect().top].map(Math.round), img: e.querySelector('img')?.naturalWidth ?? null })))" },
  { id: "r-m-spin-open", ctx: mobile(false), url: "", act: seq(wait(3000), (p) => p.waitForSelector(".spin", { timeout: 20000 }).catch(() => {}), wait(2000), tap(".spin__float, .spin__tag"), wait(900)),
    probe: "document.querySelector('.spin__card')?.innerText" },
  { id: "r-m-parrainer", ctx: mobile(false), url: "#/parrainer", act: seq(full, wait(1500)), probe: "document.querySelector('.spage__count')?.innerText" },
  { id: "r-m-merci", ctx: mobile(false), url: "?merci", act: seq(full, wait(1200)), probe: "location.hash + ' | ' + (document.querySelector('.tk-paid')?.innerText ?? 'no banner')" },
  { id: "r-d-intro", ctx: desktop(false), url: "?intro", intro: true },
  { id: "r-d-home", ctx: desktop(false), url: "", probe: "document.querySelector('.sheet, .panel')?.innerText" },
  // the site online (with base.txt): no developer hooks there, so plain waits
  { id: "p-m-intro", ctx: mobile(false), url: "?intro", intro: true, probe: "document.querySelector('.intro')?.innerText" },
  { id: "p-m-home", ctx: mobile(false), url: "", plain: 16000, probe: "document.querySelector('.sheet')?.innerText" },
  { id: "p-l-home", ctx: sideways(), url: "", plain: 16000 },
  { id: "p-t-home", ctx: tablet(), url: "", plain: 16000 },
  { id: "p-d-home", ctx: desktop(false), url: "", plain: 16000, probe: "[...document.querySelectorAll('link[rel=preload]')].map((l) => l.href.split('/').pop()).join(' ') + ' | fonts ' + document.fonts.check('860 100px \"Archivo Variable\"')" },
  { id: "p-m-carnet", ctx: mobile(false), url: "admin/", plain: 6000, probe: "document.body.innerText" },
  { id: "p-m-carnet-offline", ctx: mobile(false), url: "admin/", plain: 6000, act: carnetOffline, probe: "window.__qa" },
  // the navigation, the sections and the voyage, online
  { id: "p-m-nav-journal", ctx: mobile(false), url: "", plain: 14000, act: seq(tap(".lnav__item--journal"), wait(2500)), probe: "document.querySelector('.lnav [aria-current]')?.innerText + ' | ' + location.hash" },
  { id: "p-m-shelf", ctx: mobile(false), url: "#/journal", plain: 14000, act: seq(toShelf, wait(3000)), probe: "[...document.querySelectorAll('.gf-root')].map((f) => f.querySelector('.gf-title').innerText + ' (' + f.querySelector('.gf-meta').innerText + ')').join(' ; ')" },
  { id: "p-m-shelf-open", ctx: mobile(false), url: "#/journal", plain: 14000, act: seq(toShelf, wait(1500), tap(".gf-hit"), wait(2600)), probe: "[...document.querySelectorAll('.gf-root[data-open] .gf-sheet')].map((x) => x.innerText.replace(/\\n/g, ' ')).join(' | ')" },
  { id: "p-d-shelf-open", ctx: desktop(false), url: "#/journal", plain: 14000, act: seq(toShelf, wait(1500), tap(".gf-hit"), wait(2600)) },
  { id: "p-m-about", ctx: mobile(false), url: "#/apropos", plain: 14000, act: seq((p) => p.evaluate(() => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = b.scrollHeight; }), wait(1200)), probe: "(document.querySelector('.logo-note') ? 'logo section still there' : 'no logo section') + ' | ' + document.querySelector('.brand__title')?.innerText" },
  { id: "p-m-voyage", ctx: mobile(false), url: "#/voyage", plain: 10000, probe: "document.querySelector('.tun')?.innerText" },
  // after the security and speed work: the explorer's whole list, the sponsors' coins, sign-ups closed or not
  { id: "p-m-explore", ctx: mobile(false), url: "#/explorer", plain: 12000, act: seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(900), (p) => p.evaluate(() => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = b.scrollHeight; }), wait(1500)),
    probe: "document.querySelectorAll('.psection').length + ' sections, ' + document.querySelectorAll('.psection .prow').length + ' places; sheet ' + document.documentElement.dataset.sheet" },
  { id: "p-m-spin", ctx: mobile(false), url: "", plain: 12000,
    probe: "JSON.stringify([...document.querySelectorAll('.spin')].map((e) => ({ cls: e.className.replace('maplibregl-marker maplibregl-marker-anchor-bottom ', ''), img: e.querySelector('img')?.naturalWidth ?? null })))" },
  { id: "p-m-auth", ctx: mobile(false), url: "", plain: 4000, act: (p) => p.evaluate(async () => {
      const r = await fetch("https://jmedorwtksxxnzwyjvbz.supabase.co/auth/v1/settings?apikey=sb_publishable_-XKxRnwVevyUpGjZ9HF0NQ_4B_ykHCx").then((x) => x.json()).catch((e) => ({ error: String(e) }));
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? "csp on" : "NO CSP";
      window.__qa = `${csp} | signup ${r.disable_signup ? "closed" : "OPEN"} | autoconfirm ${r.mailer_autoconfirm} | anonymous ${r.anonymous_users ?? "?"} | providers ${Object.entries(r.external || {}).filter(([, v]) => v).map(([k]) => k).join(",")}`;
    }), probe: "window.__qa" },
  // Impeccable critique and audit (November 2026): every surface online, as a phone and a computer see it
  ...(() => {
    const open = seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(1200));
    const down = (y) => (p) => p.evaluate((y) => { const b = document.querySelector(".sheet__body"); if (b) b.scrollTop = y; }, y);
    const A = "(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; }; const nm = (e) => ((e.getAttribute('aria-label') || '') + (e.innerText || '') + (e.getAttribute('title') || '') + ([...(e.labels || [])].map((l) => l.innerText).join('')) + (e.querySelector('img[alt]')?.alt || '')).trim(); const c = [...document.querySelectorAll('button, a[href], [role=button], [role=slider], input:not([type=hidden]), textarea, select')].filter(vis); const un = c.filter((e) => !nm(e) && e.name !== 'website').map((e) => (e.className || e.tagName).toString().split(' ')[0]); const sm = c.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map((e) => (e.className || e.tagName).toString().split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)); const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.tagName[1]).join(''); const fs = [...document.querySelectorAll('.sheet *, .panel *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(e)).map((e) => parseFloat(getComputedStyle(e).fontSize)); return 'controls ' + c.length + ' | unnamed ' + un.length + ' [' + [...new Set(un)].slice(0, 8).join(', ') + '] | under24 ' + sm.length + ' [' + [...new Set(sm)].slice(0, 10).join(', ') + '] | img-no-alt ' + document.querySelectorAll('img:not([alt])').length + ' | headings ' + hs + ' | min-font ' + Math.min(...fs) + ' | hscroll ' + (document.documentElement.scrollWidth > innerWidth) + ' | lang ' + document.documentElement.lang; })()";
    const small = () => ({ ...mobile(false), viewport: { width: 320, height: 640 } });
    return [
      { id: "c-m-home-peek", ctx: mobile(false), url: "", plain: 16000, probe: A },
      { id: "c-m-home-1", ctx: mobile(false), url: "", plain: 14000, act: open, probe: A },
      { id: "c-m-home-2", ctx: mobile(false), url: "", plain: 14000, act: seq(open, down(760), wait(900)), probe: A },
      { id: "c-m-home-3", ctx: mobile(false), url: "", plain: 14000, act: seq(open, down(1560), wait(900)), probe: A },
      { id: "c-m-home-4", ctx: mobile(false), url: "", plain: 14000, act: seq(open, down(99999), wait(900)), probe: A },
      { id: "c-m-journal-1", ctx: mobile(false), url: "#/journal", plain: 14000, act: open, probe: A },
      { id: "c-m-journal-2", ctx: mobile(false), url: "#/journal", plain: 14000, act: seq(open, down(800), wait(1500)), probe: A },
      { id: "c-m-journal-3", ctx: mobile(false), url: "#/journal", plain: 14000, act: seq(open, down(99999), wait(1500)), probe: A },
      { id: "c-m-explore-1", ctx: mobile(false), url: "#/explorer", plain: 14000, act: open, probe: A },
      { id: "c-m-stats-1", ctx: mobile(false), url: "#/stats", plain: 14000, act: open, probe: A },
      { id: "c-m-stats-2", ctx: mobile(false), url: "#/stats", plain: 14000, act: seq(open, down(800), wait(1200)), probe: A },
      { id: "c-m-about-1", ctx: mobile(false), url: "#/apropos", plain: 14000, act: open, probe: A },
      { id: "c-m-about-2", ctx: mobile(false), url: "#/apropos", plain: 14000, act: seq(open, down(800), wait(1200)), probe: A },
      { id: "c-m-questions", ctx: mobile(false), url: "#/questions", plain: 14000, act: open, probe: A },
      { id: "c-m-place", ctx: mobile(false), url: "#/lieu/n527531217", plain: 16000, probe: A },
      { id: "c-m-search", ctx: mobile(false), url: "#/explorer", plain: 14000, act: seq(open, (p) => p.fill(".search input", "hut").catch(() => {}), wait(1800)), probe: A },
      { id: "c-s-home-1", ctx: small(), url: "", plain: 14000, act: open, probe: A },
      { id: "c-s-parrainer", ctx: small(), url: "#/parrainer", plain: 14000, act: open, probe: A },
      { id: "c-m-after-stats", ctx: mobile(false), url: "#/stats", plain: 14000, act: open, probe: "document.querySelector('.figs')?.innerText" },
      { id: "c-m-after-journal", ctx: mobile(false), url: "#/journal", plain: 14000, act: open, probe: A },
      { id: "c-m-after-pins", ctx: mobile(false), url: "", plain: 16000, probe: "[...document.querySelectorAll('.spin')].map((e) => e.className.replace('maplibregl-marker maplibregl-marker-anchor-bottom ', '') + ' card ' + getComputedStyle(e.querySelector('.spin__card')).visibility).join(' | ')" },
      { id: "c-s-after-parrainer", ctx: small(), url: "#/parrainer", plain: 14000, act: open, probe: "document.querySelector('.ridge__readout')?.innerText + ' | ' + document.querySelector('.spage__lead')?.innerText.slice(0, 90)" },
      { id: "c-d-home", ctx: desktop(false), url: "", plain: 16000, probe: A },
      { id: "c-d-journal", ctx: desktop(false), url: "#/journal", plain: 14000, probe: A },
      { id: "c-d-parrainer", ctx: desktop(false), url: "#/parrainer", plain: 14000, probe: A },
    ];
  })(),
  // the purchase and the gift, online: the page, the gift, a ticket's form, back from Stripe, and the server functions
  { id: "p-m-pay-page", ctx: mobile(false), url: "#/parrainer", plain: 12000, act: seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(1200)),
    probe: "[...document.querySelectorAll('.tk-deck')].map((d) => d.querySelector('h2').innerText + ' ' + d.querySelectorAll('.tk-mini').length).join(', ') + ' | gift ' + !!document.querySelector('.gift') + ' | ' + (/galère|colis|mon sac/i.test(document.body.innerText) ? 'OLD KINDS STILL THERE' : 'no old kinds')" },
  { id: "p-m-pay-gift", ctx: mobile(false), url: "#/parrainer", plain: 12000,
    act: seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(1200), (p) => p.evaluate(() => document.querySelector(".gift")?.scrollIntoView({ block: "start" })), wait(900), tap(".gift__amount:nth-child(2)"), wait(700)),
    probe: "document.querySelector('.gift')?.innerText" },
  { id: "p-m-pay-form", ctx: mobile(false), url: "#/parrainer", plain: 12000,
    act: seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(1200), tap(".tk-mini:not(.is-taken)"), wait(2500), tap(".tk__stub .btn--primary:not([disabled])"), wait(900), (p) => p.evaluate(() => document.querySelector(".tk__form")?.scrollIntoView({ block: "start" })), wait(900)),
    probe: "(document.querySelector('.tk__name')?.innerText ?? 'no ticket') + ' | ' + (document.querySelector('.tk__form')?.innerText ?? 'no form')" },
  { id: "p-m-pay-free", ctx: mobile(false), url: "#/parrainer", plain: 12000,
    act: seq(tap(".sheet__grip"), wait(600), tap(".sheet__grip"), wait(1200), tap(".tk-mini:not(.is-taken)"), wait(2500), tap(".tk__stub .btn--primary:not([disabled])"), wait(900), tap(".tk__free input"), wait(700), (p) => p.evaluate(() => document.querySelector(".tk__form")?.scrollIntoView({ block: "start" })), wait(900)),
    probe: "document.querySelector('.tk__form')?.innerText ?? 'no form'" },
  { id: "p-d-pay-page", ctx: desktop(false), url: "#/parrainer", plain: 12000, act: seq(tap(".tk-mini:not(.is-taken)"), wait(2500)) },
  { id: "p-m-pay-merci", ctx: mobile(false), url: "?merci&cs=cs_test_qaprobe0000", plain: 14000, probe: "location.hash + ' | ' + (document.querySelector('.tk-paid')?.innerText ?? 'no banner')" },
  { id: "p-m-pay-fn", ctx: mobile(false), url: "", plain: 3000, act: (p) => p.evaluate(async () => {
      const U = "https://jmedorwtksxxnzwyjvbz.supabase.co", K = "sb_publishable_-XKxRnwVevyUpGjZ9HF0NQ_4B_ykHCx";
      const h = { apikey: K, "Content-Type": "application/json" };
      const post = (fn, body, extra = {}) => fetch(`${U}/functions/v1/${fn}`, { method: "POST", headers: { ...h, ...extra }, body: JSON.stringify(body) })
        .then(async (r) => `${r.status} ${(await r.text()).slice(0, 80)}`).catch((e) => `ERR ${e}`);
      // (only the status and how many rows: never what they hold)
      const rest = (path, init = {}) => fetch(`${U}/rest/v1/${path}`, { headers: h, ...init }).then(async (r) => {
        const j = await r.json().catch(() => null);
        return `${r.status} ${Array.isArray(j) ? j.length + " rows" : String(j?.message ?? j ?? "").slice(0, 70)}`;
      }).catch((e) => `ERR ${e}`);
      const out = {
        sweep: await post("checkout", { action: "sweep" }),
        gift: await post("checkout", { action: "gift", amount: 500, lang: "fr" }),
        confirm: await post("checkout", { action: "confirm", session: "cs_test_qaprobe0000" }),
        check: await post("checkout", { action: "check" }),
        ewan: await post("push", { action: "ewan", kind: "gift", title: "x", body: "x" }),
        ewanFake: await post("push", { action: "ewan", kind: "gift", title: "x", body: "x" }, { "x-push-secret": "nope" }),
        ewanTest: await post("push", { action: "ewan-test", endpoint: "https://example.com/x" }),
        key: await fetch(`${U}/functions/v1/push?key`, { headers: { apikey: K } }).then((r) => `${r.status}`).catch((e) => `ERR ${e}`),
        buyBad: await rest("rpc/start_purchase", { method: "POST", body: JSON.stringify({ p_spot: "bogus", p_label: "x", p_name: "x", p_contact: "x", p_link: null, p_message: null, p_amount_cents: 500, p_lang: "fr", p_device: crypto.randomUUID() }) }),
        gifts: await rest("gifts?select=id&limit=1"),
        adminPush: await rest("admin_push?select=endpoint&limit=1"),
        reqContact: await rest("sponsor_requests?select=contact&limit=1"),
        reqPublic: await rest("sponsor_requests?select=kind,hold_until&limit=1"),
        keyHint: await rest("rpc/admin_stripe_key_hint", { method: "POST", body: "{}" }),
        setKey: await rest("rpc/admin_set_stripe_key", { method: "POST", body: JSON.stringify({ p_key: "rk_test_" + "x".repeat(24) }) }),
      };
      window.__qa = Object.entries(out).map(([k, v]) => `${k}: ${v}`).join(" || ");
    }), probe: "window.__qa" },
  // the database as visitors reach it: each request's status, and the live feed's channel joined
  { id: "p-m-data", ctx: mobile(false), url: "", plain: 3000, act: watchData, probe: "window.__qa" },
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
      if (s.act) { await s.act(page); mark("acted"); }
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
