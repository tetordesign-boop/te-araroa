// The logo's geometry, "Cap au sud": the Southern Cross where it really is in the sky (J2000 positions),
// upright as seen from New Zealand, its faint fifth star (ε Crucis) taken by Ewan's orange track marker.
// Writes web/src/brand/crux.json, the one source for the site's mark, the app icons and the link preview.
// Usage (from the repo root): node scripts/brand/crux.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/src/brand/crux.json");
// name, right ascension (°), declination (°), magnitude
const CATALOGUE = [["gamma", 187.791, -57.113, 1.64], ["alpha", 186.650, -63.099, 0.76], ["beta", 191.930, -59.689, 1.25], ["delta", 183.786, -58.749, 2.79], ["epsilon", 185.340, -60.401, 3.59]];
const RA0 = 187.6, DEC0 = -60.1, K = Math.cos((DEC0 * Math.PI) / 180), SCALE = 12.4;
// east on the left, as in the sky; north up: Gacrux at the top, Acrux at the foot
const at = (ra, dec) => [50 - (ra - RA0) * K * SCALE, 50 - (dec - DEC0) * SCALE];
const round = (v) => Math.round(v * 100) / 100;
const radius = (mag) => Math.max(6.2, 13.2 - mag * 2.6);

const stars = CATALOGUE.filter(([n]) => n !== "epsilon").map(([name, ra, dec, mag]) => {
  const [x, y] = at(ra, dec);
  return { name, x: round(x), y: round(y), r: round(radius(mag)) };
});
const [ex, ey] = at(185.340, -60.401);
const ewan = { x: round(ex), y: round(ey), s: 12 };

// a square box around everything (with a little room), for drawing the mark on its own
const xs = stars.flatMap((s) => [s.x - s.r, s.x + s.r]), ys = stars.flatMap((s) => [s.y - s.r, s.y + s.r]);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const side = Math.max(x1 - x0, y1 - y0) + 4;
const box = [round((x0 + x1) / 2 - side / 2), round((y0 + y1) / 2 - side / 2), round(side), round(side)];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ stars, ewan, axes: [["gamma", "alpha"], ["beta", "delta"]], box }, null, 1) + "\n");
console.log("web/src/brand/crux.json written", JSON.stringify({ stars, ewan, box }));
