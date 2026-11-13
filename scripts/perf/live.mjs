// The site as it is online, opened like a relative would on a phone: what it downloads, how fast it shows,
// and whatever goes wrong (console errors, failed requests). Usage: node scripts/perf/live.mjs <outdir>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "/tmp/perf";
mkdirSync(OUT, { recursive: true });
const SITE = "https://tetordesign-boop.github.io/te-araroa/";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const phone = (locale) => ({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale, timezoneId: "Pacific/Auckland", userAgent: IPHONE });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });

const kind = (url, type) => {
  if (/\.(js|mjs)(\?|$)/.test(url)) return "js";
  if (/\.css(\?|$)/.test(url)) return "css";
  if (/\.(woff2?|ttf|otf)(\?|$)/.test(url)) return "font";
  if (/\.(pbf|mvt)(\?|$)|\/tiles\/|tile\//.test(url)) return "tiles";
  if (/\.(png|jpe?g|webp|avif|svg|gif)(\?|$)/.test(url)) return "image";
  if (/supabase\.co/.test(url)) return "data";
  if (/\.json(\?|$)/.test(url)) return "json";
  return type || "other";
};

async function visit(name, url, { locale = "fr-FR", wait = 15000, warm = false } = {}) {
  const ctx = await browser.newContext(phone(locale));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  const reqs = new Map();
  const done = [];
  const errors = [];
  const failed = [];
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type, t: e.timestamp }));
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) done.push({ ...r, bytes: e.encodedDataLength, end: e.timestamp }); });
  cdp.on("Network.loadingFailed", (e) => { const r = reqs.get(e.requestId); if (r && !e.canceled) failed.push(`${e.errorText} ${r.url.slice(0, 140)}`); });
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 220)); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
  p.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 140)}`); });
  if (warm) { await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(wait); done.length = 0; failed.length = 0; errors.length = 0; }
  const t0 = Date.now();
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(wait);
  const timing = await p.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]));
    const lcp = performance.getEntriesByType("largest-contentful-paint");
    const nav = performance.getEntriesByType("navigation")[0];
    return { fcp: paint["first-contentful-paint"] ?? null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null, canvas: !!document.querySelector("canvas.maplibregl-canvas"), title: document.title };
  });
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const byKind = {};
  for (const r of done) { const k = kind(r.url, r.type); byKind[k] ??= { n: 0, kb: 0 }; byKind[k].n++; byKind[k].kb += r.bytes / 1024; }
  for (const k in byKind) byKind[k].kb = Math.round(byKind[k].kb);
  const total = Math.round(done.reduce((s, r) => s + r.bytes, 0) / 1024);
  const biggest = [...done].sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((r) => `${Math.round(r.bytes / 1024)} kB ${r.url.replace(SITE, "/").slice(0, 120)}`);
  const res = { name, url, warm, loadMs, ...timing, requests: done.length, totalKB: total, byKind, biggest, failed: [...new Set(failed)], errors: [...new Set(errors)] };
  await ctx.close();
  return res;
}

const results = [];
for (const [name, url, opts] of [
  ["home-fr", SITE, {}],
  ["home-fr-again", SITE, { warm: true }],
  ["home-en", SITE, { locale: "en-NZ" }],
  ["about", `${SITE}#/apropos`, {}],
  ["questions", `${SITE}#/questions`, {}],
  ["carnet", `${SITE}admin/`, { wait: 5000 }],
]) {
  try { results.push(await visit(name, url, opts)); } catch (e) { results.push({ name, url, crash: String(e).slice(0, 300) }); }
  const r = results.at(-1);
  console.log(`${name}: ${r.crash ?? `${r.totalKB} kB in ${r.requests} requests, load ${r.loadMs} ms, FCP ${r.fcp} ms, map ${r.canvas}, ${r.errors.length} errors, ${r.failed.length} failed`}`);
}
writeFileSync(`${OUT}/live.json`, JSON.stringify(results, null, 2));
await browser.close();
