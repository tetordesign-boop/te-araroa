// App icons in the night palette: the track marker glowing on Mackenzie navy (web/public/icons).
// Usage (from the repo root): node scripts/brand/icons.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/public/icons");
// the marker triangle, in a 100x100 box (nail hole near the top)
// a triangle with rounded corners: the polygon stroked in its own colour, round joins
const tri = (s, cx, cy) => {
  const h = s * 0.866, top = cy - h * 0.6, bot = cy + h * 0.4;
  return { d: `M${cx} ${top} L${cx + s / 2} ${bot} L${cx - s / 2} ${bot} Z`, w: s * 0.16, top };
};
const svg = ({ size, scale = 1, carnet = false, round = 0 }) => {
  const s = 52 * scale, cx = 50, cy = 55;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#16223A"/><stop offset="1" stop-color="#0A1222"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="56%" r="50%"><stop offset="0" stop-color="#FF6B12" stop-opacity=".55"/><stop offset=".55" stop-color="#FF6B12" stop-opacity=".12"/><stop offset="1" stop-color="#FF6B12" stop-opacity="0"/></radialGradient>
    <linearGradient id="tri" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8A3A"/><stop offset="1" stop-color="#FF5F08"/></linearGradient>
  </defs>
  <rect width="100" height="100" rx="${round}" fill="url(#bg)"/>
  <circle cx="50" cy="56" r="${44 * scale}" fill="url(#glow)"/>
  <path d="${tri(s, cx, cy).d}" fill="url(#tri)" stroke="url(#tri)" stroke-width="${tri(s, cx, cy).w}" stroke-linejoin="round"/>
  ${carnet
    ? `<g stroke="#2A1203" stroke-width="${3.4 * scale}" stroke-linecap="round" opacity=".75"><path d="M${50 - 9 * scale} ${cy + 6 * scale}h${18 * scale}"/><path d="M${50 - 6 * scale} ${cy + 13 * scale}h${12 * scale}"/></g>`
    : `<circle cx="50" cy="${tri(s, cx, cy).top + s * 0.3}" r="${2.7 * scale}" fill="#2A1203" opacity=".5"/>`}
</svg>`;
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const shots = [
  ["icon-512.png", 512, {}], ["icon-192.png", 192, {}], ["apple-touch-icon.png", 180, {}],
  ["icon-maskable-512.png", 512, { scale: 0.78 }],
  ["carnet-512.png", 512, { carnet: true }], ["carnet-192.png", 192, { carnet: true }], ["carnet-180.png", 180, { carnet: true }],
];
for (const [name, size, o] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg({ size, ...o })}</body></html>`);
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}
// the favicon stays vector
writeFileSync(`${OUT}/favicon.svg`, svg({ size: 64, round: 22 }).replace(` width="64" height="64"`, ""));
await browser.close();
console.log("web/public/icons written");
