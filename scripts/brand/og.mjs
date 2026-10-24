// The link preview (WhatsApp, iMessage, Messenger): web/public/og.jpg, 1200 x 630, in the site's night palette.
// Usage (from the repo root): node scripts/brand/og.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walker } from "./walker.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = `${ROOT}/web`;
const land = JSON.parse(readFileSync(`${WEB}/src/dev/nz-land.json`, "utf8"));
const trail = JSON.parse(readFileSync(`${WEB}/src/data/trail-lite.json`, "utf8"));

// the mark, "Le marcheur" (same drawing as web/src/ui/icons.tsx), above the title as in the site's presentation
const mark = `<svg class="mark" viewBox="0 0 100 100" width="112" height="112">${walker()}</svg>`;

// the South Island (and Stewart Island, the Sounds) in a box on the right
const W = 1200, H = 630, box = { x: 700, y: 46, w: 480, h: 566 };
const lon0 = 166.3, lon1 = 174.6, lat0 = -47.4, lat1 = -40.35;
const k = Math.cos((-43.8 * Math.PI) / 180);
const sx = box.w / ((lon1 - lon0) * k), sy = box.h / (lat1 - lat0), s = Math.min(sx, sy);
const ox = box.x + (box.w - (lon1 - lon0) * k * s) / 2, oy = box.y + (box.h - (lat1 - lat0) * s) / 2;
const P = ([lng, lat]) => [ox + (lng - lon0) * k * s, oy + (lat1 - lat) * s];
const path = (pts) => pts.map((p, i) => { const [x, y] = P(p); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
// the South Island, Stewart Island and the small islands around them (not the North Island's tip)
const polys = land.geometry.coordinates
  .filter((poly) => poly[0].every(([, lat]) => lat < -40.3) && poly[0].some(([lng]) => lng > 166))
  .map((poly) => `${path(poly[0])}Z`).join("");
const lines = trail.parts.map((part) => path(part.map(([lng, lat]) => [lng, lat]))).join("");
const [sxs, sys] = P(trail.places[0].c), [bx, by] = P(trail.places[trail.places.length - 1].c);
const font = (f) => `file://${WEB}/node_modules/@fontsource-variable/${f}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-ext-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; unicode-range: U+0100-02BA; }
@font-face { font-family: F; src: url(file://${WEB}/src/fonts/fine-space.woff2) format("woff2"); unicode-range: U+202F; }
@font-face { font-family: L; src: url(${font("literata/files/literata-latin-opsz-normal.woff2")}) format("woff2"); font-weight: 200 900; }
html, body { margin: 0; }
body { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; color: #F3F6FB;
  background: radial-gradient(120% 90% at 78% 40%, #13213A 0%, #0C1526 55%, #070E1B 100%); font-family: F, A; }
body > svg { position: absolute; inset: 0; }
.mark { display: block; margin: 0 0 14px -29px; filter: drop-shadow(0 0 16px rgba(255, 107, 18, 0.25)); }
.text { position: absolute; left: 72px; top: 0; bottom: 0; width: 590px; display: flex; flex-direction: column; justify-content: center; }
h1 { margin: 0; white-space: nowrap; font-size: 86px; line-height: 0.92; font-weight: 860; font-stretch: 125%; letter-spacing: -0.045em; }
p { margin: 30px 0 0; font-family: F, L; font-size: 30px; line-height: 1.42; color: #DCE4F0; max-width: 520px; }
.km { margin-top: 34px; display: flex; align-items: baseline; gap: 10px; font-size: 22px; font-weight: 650; color: #A9B6CC; }
.km b { font-size: 46px; font-weight: 860; font-stretch: 125%; letter-spacing: -0.04em; color: #F3F6FB; }
.km span.u { color: #FF8B3D; font-weight: 760; font-stretch: 112%; font-size: 24px; }
</style></head><body>
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <path d="${polys}" fill="#14223A" stroke="#5CD6E6" stroke-opacity=".38" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="${lines}" fill="none" stroke="#EAF2FF" stroke-width="6" stroke-opacity=".28" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <path d="${lines}" fill="none" stroke="#EAF2FF" stroke-width="2.6" stroke-opacity=".9" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${sxs}" cy="${sys}" r="6.5" fill="#0C1526" stroke="#F3F6FB" stroke-width="3"/>
  <circle cx="${bx}" cy="${by}" r="6.5" fill="#0C1526" stroke="#F3F6FB" stroke-width="3"/>
</svg>
<div class="text">
  ${mark}
  <h1>Te Araroa<br>avec Ewan</h1>
  <p>À pied sur l'île du Sud, de Ship Cove à Bluff : sa position, ses photos et son journal, jour après jour.</p>
  <div class="km"><b>1 334</b><span class="u">km</span><span>de sentier</span></div>
</div>
</body></html>`;

const exe = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// from a file, so the page may load the fonts from node_modules
const dir = mkdtempSync(`${tmpdir()}/og-`);
writeFileSync(`${dir}/og.html`, html);
await page.goto(`file://${dir}/og.html`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${WEB}/public/og.jpg`, type: "jpeg", quality: 88 });
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log("web/public/og.jpg written");
