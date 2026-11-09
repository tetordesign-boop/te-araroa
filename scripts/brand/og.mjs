// The link preview (WhatsApp, iMessage, Messenger): web/public/og.jpg, 1200 x 630. Type only, like the site: the
// brand mark (mark.mjs) small at the top, the title very large, a line and the trail's length.
// Usage (from the repo root): node scripts/brand/og.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { C, FONTS, markHtml, WEB } from "./mark.mjs";

const W = 1200, H = 630;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
html, body { margin: 0; }
body { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; color: ${C.ink}; background: ${C.deep}; font-family: F, A; }
.mark { position: absolute; left: 72px; top: 64px; box-shadow: 0 0 0 1px rgba(170, 200, 240, 0.16); border-radius: 22px; overflow: hidden; }
.text { position: absolute; left: 72px; right: 72px; bottom: 64px; }
h1 { margin: 0; white-space: nowrap; font-size: 116px; line-height: 0.9; font-weight: 880; font-stretch: 125%; letter-spacing: -0.05em; }
.foot { margin-top: 30px; display: flex; align-items: baseline; justify-content: space-between; gap: 40px; }
p { margin: 0; font-family: F, L; font-size: 28px; line-height: 1.4; color: #DCE4F0; max-width: 760px; text-wrap: pretty; }
.km { display: flex; align-items: baseline; gap: 10px; font-size: 22px; font-weight: 650; color: ${C.ink2}; white-space: nowrap; }
.km b { font-size: 52px; font-weight: 880; font-stretch: 125%; letter-spacing: -0.04em; color: ${C.ink}; }
.km span.u { color: ${C.hot}; font-weight: 760; font-stretch: 112%; font-size: 24px; }
</style></head><body>
<div class="mark">${markHtml({ size: 96, radius: 22 })}</div>
<div class="text">
  <h1>Te Araroa<br>avec moi</h1>
  <div class="foot">
    <p>Je marche l'île du Sud, de Ship Cove à Bluff\u202f: ma position, mes photos et mon journal, jour après jour.</p>
    <div class="km"><b>1 334</b><span class="u">km</span></div>
  </div>
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
