// App icons, "Le marcheur": Ewan seen from behind, his pack orange, in the night (web/public/icons).
// The Carnet (Ewan's own app) has the same figure in reverse, navy with a white pack on marker orange, to tell
// them apart on the home screen. Geometry: web/src/brand/walker.json, drawn by scripts/brand/walker.mjs.
// Usage (from the repo root): node scripts/brand/icons.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walker } from "./walker.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = `${ROOT}/web/public/icons`;

/**
 * The figure in a 100 x 100 square. scale: how much of the square its own 100 x 100 box takes (the maskable icon
 * keeps it inside the safe circle); round: the corner radius (0 for the home-screen icons, the system rounds them).
 */
function icon({ size, scale = 0.8, round = 0, carnet = false, compact = false }) {
  // the figure's box centred, nudged up half a unit (its feet reach lower than its head)
  const o = 50 - 50 * scale, oy = o - 0.5 * scale;
  const bg = carnet
    ? `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#F25A05"/></linearGradient>`
    : `<radialGradient id="bg" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#1A2B4A"/><stop offset=".55" stop-color="#0C1526"/><stop offset="1" stop-color="#050A15"/></radialGradient>`;
  // a soft orange light around the pack (on the night only): Ewan's light, as on the map
  const glow = carnet ? "" : `<radialGradient id="glow"><stop offset="0" stop-color="#FF6B12" stop-opacity=".34"/><stop offset="1" stop-color="#FF6B12" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>${bg}${glow}</defs>
  <rect width="100" height="100" rx="${round}" fill="url(#bg)"/>
  <g transform="translate(${o.toFixed(3)} ${oy.toFixed(3)}) scale(${scale})">
    ${glow ? `<ellipse cx="50" cy="45" rx="40" ry="44" fill="url(#glow)"/>` : ""}
    ${walker({ carnet, compact })}
  </g>
</svg>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const shots = [
  ["icon-512.png", 512, {}], ["icon-192.png", 192, {}], ["apple-touch-icon.png", 180, {}],
  ["icon-maskable-512.png", 512, { scale: 0.7 }],
  ["carnet-512.png", 512, { carnet: true }], ["carnet-192.png", 192, { carnet: true }], ["carnet-180.png", 180, { carnet: true }],
];
for (const [name, size, o] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon({ size, ...o })}</body></html>`);
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}
// the favicon stays vector, in the compact drawing (it is shown at 16 to 32 pixels)
writeFileSync(`${OUT}/favicon.svg`, icon({ size: 64, round: 22, compact: true, scale: 0.98 }).replace(` width="64" height="64"`, "") + "\n");
await browser.close();
console.log("web/public/icons written");
