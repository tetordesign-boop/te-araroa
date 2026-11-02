// The brand mark (mark.mjs) as files: the app icons (the site's, the Carnet's, the maskable one) and the favicons,
// in web/public/icons.
// Usage (from the repo root): node scripts/brand/icons.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { FONTS, markHtml, ROOT } from "./mark.mjs";

const OUT = [
  // [file, variant, size, letters' share, corner radius]
  ["web/public/icons/icon-512.png", "site", 512, 0.4],
  ["web/public/icons/icon-192.png", "site", 192, 0.4],
  ["web/public/icons/apple-touch-icon.png", "site", 180, 0.4],
  ["web/public/icons/icon-maskable-512.png", "site", 512, 0.32],
  ["web/public/icons/carnet-512.png", "carnet", 512, 0.4],
  ["web/public/icons/carnet-192.png", "carnet", 192, 0.4],
  ["web/public/icons/carnet-180.png", "carnet", 180, 0.4],
  // (a little bigger in a browser tab, where they're drawn at 16 to 32 px)
  ["web/public/icons/favicon.png", "site", 64, 0.46, 14],
  ["web/public/icons/favicon-carnet.png", "carnet", 64, 0.46, 14],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
html, body { margin: 0; background: transparent; } body > div { margin: 0 0 8px; }
</style></head><body>${OUT.map(([, variant, size, scale, radius = 0], i) => markHtml({ size, variant, scale, radius, id: `m${i}` })).join("")}</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
// from a file, so the page may load the fonts from node_modules
const dir = mkdtempSync(`${tmpdir()}/icons-`);
writeFileSync(`${dir}/icons.html`, html);
await page.goto(`file://${dir}/icons.html`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
for (const [i, [file]] of OUT.entries()) {
  await page.locator(`#m${i}`).screenshot({ path: `${ROOT}/${file}`, omitBackground: true });
  console.log(file);
}
await browser.close();
rmSync(dir, { recursive: true, force: true });
