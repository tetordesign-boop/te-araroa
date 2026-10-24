// App icons, "Cap au sud": the Southern Cross in the night, Ewan's orange marker as its fifth star (web/public/icons).
// The Carnet (Ewan's own app) has the same mark in reverse, on marker orange, to tell them apart on the home screen.
// Geometry: web/src/brand/crux.json (node scripts/brand/crux.mjs). Usage (from the repo root): node scripts/brand/icons.mjs
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = `${ROOT}/web/public/icons`;
const crux = JSON.parse(readFileSync(`${ROOT}/web/src/brand/crux.json`, "utf8"));

// the same drawings as web/src/ui/icons.tsx
const sparkle = (x, y, r) => { const k = r * 0.17; return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`; };
const triangle = (x, y, s) => { const h = s * 0.866; return `M${x} ${y - h * 0.58}L${x + s / 2} ${y + h * 0.42}L${x - s / 2} ${y + h * 0.42}Z`; };

/**
 * The mark in a 100 x 100 square. scale: how much of the square it fills (the maskable icon keeps to the safe
 * zone); small: bolder stars and marker, no dotted cross (a favicon is 16 to 32 pixels).
 */
function icon({ size, scale = 0.84, round = 0, carnet = false, small = false }) {
  const star = carnet ? "#0C1526" : "#EAF2FF";
  const ewan = carnet ? "#FFFFFF" : "#FF6B12";
  const [bx, by, bw] = crux.box;
  const k = (100 * scale) / bw, ox = 50 - (bx + bw / 2) * k, oy = 50 - (by + bw / 2) * k;
  const S = Object.fromEntries(crux.stars.map((s) => [s.name, s]));
  const grow = small ? 1.22 : 1, es = crux.ewan.s * (small ? 1.45 : 1.05);
  const stars = crux.stars.map((s) => `<path d="${sparkle(s.x, s.y, Math.max(small ? 8.6 : 0, s.r * grow))}" fill="${star}"/>`).join("");
  const axes = small ? "" : `<g stroke="${star}" stroke-opacity="${carnet ? 0.3 : 0.2}" stroke-width="${1.25 / k * 0.84}" stroke-linecap="round" stroke-dasharray="0.1 ${3.6}" fill="none">${crux.axes.map(([a, b]) => `<path d="M${S[a].x} ${S[a].y}L${S[b].x} ${S[b].y}"/>`).join("")}</g>`;
  const bg = carnet
    ? `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#F25A05"/></linearGradient>`
    : `<radialGradient id="bg" cx="62%" cy="30%" r="85%"><stop offset="0" stop-color="#1A2843"/><stop offset=".55" stop-color="#0C1526"/><stop offset="1" stop-color="#050A15"/></radialGradient>`;
  // a soft light around Ewan's marker (on the night only)
  const glow = carnet ? "" : `<radialGradient id="glow"><stop offset="0" stop-color="#FF6B12" stop-opacity=".42"/><stop offset="1" stop-color="#FF6B12" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>${bg}${glow}</defs>
  <rect width="100" height="100" rx="${round}" fill="url(#bg)"/>
  <g transform="translate(${ox.toFixed(3)} ${oy.toFixed(3)}) scale(${k.toFixed(4)})">
    ${glow ? `<circle cx="${crux.ewan.x}" cy="${crux.ewan.y}" r="${es * 1.6}" fill="url(#glow)"/>` : ""}
    ${axes}${stars}
    <path d="${triangle(crux.ewan.x, crux.ewan.y, es)}" fill="${ewan}" stroke="${ewan}" stroke-width="${(es * 0.14).toFixed(2)}" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const shots = [
  ["icon-512.png", 512, {}], ["icon-192.png", 192, {}], ["apple-touch-icon.png", 180, {}],
  ["icon-maskable-512.png", 512, { scale: 0.66 }],
  ["carnet-512.png", 512, { carnet: true }], ["carnet-192.png", 192, { carnet: true }], ["carnet-180.png", 180, { carnet: true }],
];
for (const [name, size, o] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon({ size, ...o })}</body></html>`);
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}
// the favicon stays vector (drawn bold: it is shown at 16 to 32 pixels)
writeFileSync(`${OUT}/favicon.svg`, icon({ size: 64, round: 22, small: true, scale: 0.9 }).replace(` width="64" height="64"`, ""));
await browser.close();
console.log("web/public/icons written");
