// The link preview (WhatsApp, iMessage, Messenger): web/public/og.jpg, 1200 x 630. The brand image, "Le sentier,
// la nuit" (scripts/brand/scene.mjs), fills the right; the title and a line on the left, on the same night.
// Usage (from the repo root): node scripts/brand/og.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sceneSvg } from "./scene.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = `${ROOT}/web`;
const W = 1200, H = 630;
const font = (f) => `file://${WEB}/node_modules/@fontsource-variable/${f}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-ext-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; unicode-range: U+0100-02BA; }
@font-face { font-family: F; src: url(file://${WEB}/src/fonts/fine-space.woff2) format("woff2"); unicode-range: U+202F; }
@font-face { font-family: L; src: url(${font("literata/files/literata-latin-opsz-normal.woff2")}) format("woff2"); font-weight: 200 900; }
html, body { margin: 0; }
body { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; color: #F3F6FB; background: #0A1426; font-family: F, A; }
.scene { position: absolute; top: 0; right: 0; width: ${H}px; height: ${H}px; }
.scene svg { display: block; width: 100%; height: 100%; }
/* the night of the text runs into the picture's own night */
.blend { position: absolute; top: 0; bottom: 0; left: ${W - H - 1}px; width: 230px; background: linear-gradient(90deg, #0A1426 0%, rgba(10, 20, 38, 0.7) 40%, rgba(10, 20, 38, 0) 100%); }
.text { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; }
h1 { margin: 0; white-space: nowrap; font-size: 80px; line-height: 0.92; font-weight: 860; font-stretch: 125%; letter-spacing: -0.045em; }
p { margin: 28px 0 0; font-family: F, L; font-size: 28px; line-height: 1.42; color: #DCE4F0; max-width: 500px; text-wrap: pretty; }
.km { margin-top: 32px; display: flex; align-items: baseline; gap: 10px; font-size: 22px; font-weight: 650; color: #A9B6CC; }
.km b { font-size: 46px; font-weight: 860; font-stretch: 125%; letter-spacing: -0.04em; color: #F3F6FB; }
.km span.u { color: #FF8B3D; font-weight: 760; font-stretch: 112%; font-size: 24px; }
</style></head><body>
<div class="scene">${sceneSvg({ variant: "night", crop: "full", size: H })}</div>
<div class="blend"></div>
<div class="text">
  <h1>Te Araroa<br>avec Ewan</h1>
  <p>À pied sur l'île du Sud, de Ship Cove à Bluff\u202f: sa position, ses photos et son journal, jour après jour.</p>
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
