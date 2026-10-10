// Elevation along the whole trail, every 250 m, sampled from the Terrain Tiles DEM (Mapzen/AWS, terrarium).
// Usage: node scripts/data/profile.mjs <out.json> [trail.json path or URL]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import { loadTrail, sleep, UA } from "./lib.mjs";

const [, , out = "web/public/data/profile.json", trailSrc] = process.argv;
const Z = 12, STEP = 0.25;
const trail = await loadTrail(trailSrc);

// position at a given km (km is continuous across the transport gaps)
const pts = trail.parts.flat();
function at(km) {
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][2] <= km) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi];
  const t = b[2] > a[2] ? (km - a[2]) / (b[2] - a[2]) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const tileXY = (lng, lat) => {
  const n = 2 ** Z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [x, y];
};

const cache = new Map();
async function tile(x, y) {
  const key = `${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(String(res.status));
      const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
      cache.set(key, png);
      return png;
    } catch (e) { await sleep(1000 * (i + 1)); if (i === 3) throw e; }
  }
}
const h = (png, px, py) => {
  const i = (Math.min(255, Math.max(0, py)) * png.width + Math.min(255, Math.max(0, px))) * 4;
  return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
};
async function elevation(lng, lat) {
  const [fx, fy] = tileXY(lng, lat);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(tx, ty);
  const px = (fx - tx) * 256 - 0.5, py = (fy - ty) * 256 - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py), dx = px - x0, dy = py - y0;
  // bilinear inside the tile (edges clamp: good enough at 38 m per pixel)
  return h(png, x0, y0) * (1 - dx) * (1 - dy) + h(png, x0 + 1, y0) * dx * (1 - dy) + h(png, x0, y0 + 1) * (1 - dx) * dy + h(png, x0 + 1, y0 + 1) * dx * dy;
}

const total = trail.total_km;
const e = [];
for (let km = 0; km <= total + 1e-6; km += STEP) {
  const [lng, lat] = at(Math.min(km, total));
  e.push(Math.max(0, Math.round(await elevation(lng, lat))));
  if (e.length % 400 === 0) console.log(`km ${km.toFixed(0)} / ${total}, tiles ${cache.size}`);
}
// light smoothing (3-point) so DEM noise doesn't inflate the climb
const sm = e.map((v, i) => Math.round(((e[i - 1] ?? v) + v * 2 + (e[i + 1] ?? v)) / 4));
let up = 0, down = 0;
for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) up += d; else down -= d; }
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ v: 1, step: STEP, total, up, down, max: Math.max(...sm), min: Math.min(...sm), e: sm }));
console.log("profile", sm.length, "points, up", up, "down", down, "→", out);
