// Elevation along a stretch of trail, sampled from terrain tiles (Terrarium, or LINZ when a key is set).
import type { Route } from "../lib/geo";

const Z = 12;
type Decoder = (r: number, g: number, b: number) => number;
const terrarium: Decoder = (r, g, b) => r * 256 + g + b / 256 - 32768;
const mapbox: Decoder = (r, g, b) => -10000 + (r * 65536 + g * 256 + b) * 0.1;

const tiles = new Map<string, Promise<Uint8ClampedArray | null>>();

function tileUrl(x: number, y: number, linzKey?: string | null) {
  return linzKey
    ? `https://basemaps.linz.govt.nz/v1/tiles/elevation/WebMercatorQuad/${Z}/${x}/${y}.png?api=${linzKey}&pipeline=terrain-rgb`
    : `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
}

function loadTile(x: number, y: number, linzKey?: string | null) {
  const key = `${linzKey ? "l" : "t"}/${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(tileUrl(x, y, linzKey), { mode: "cors" });
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const c = document.createElement("canvas");
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      } catch (_) {
        return null;
      }
    })();
    tiles.set(key, p);
  }
  return p;
}

async function elevation(lng: number, lat: number, linzKey?: string | null): Promise<number | null> {
  const n = 2 ** Z;
  const xf = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  const data = await loadTile(x, y, linzKey);
  if (!data) return null;
  const px = Math.min(255, Math.floor((xf - x) * 256)), py = Math.min(255, Math.floor((yf - y) * 256));
  const i = (py * 256 + px) * 4;
  return (linzKey ? mapbox : terrarium)(data[i], data[i + 1], data[i + 2]);
}

export interface Profile { p: [number, number][]; up: number; down: number }

export async function profileFor(route: Route, k0: number, k1: number, linzKey?: string | null): Promise<Profile | null> {
  const a = Math.min(k0, k1), b = Math.max(k0, k1);
  if (b - a < 0.2) return null;
  const step = Math.max(0.04, (b - a) / 500);
  const ks: number[] = [];
  for (let k = a; k < b; k += step) ks.push(k);
  ks.push(b);
  const raw = await Promise.all(ks.map((k) => { const [lng, lat] = route.pointAt(k); return elevation(lng, lat, linzKey); }));
  const pts: [number, number][] = [];
  ks.forEach((k, i) => { const e = raw[i]; if (e !== null && Number.isFinite(e)) pts.push([k, e]); });
  if (pts.length < 5) return null;
  // light smoothing, then climb/descent with a 4 m hysteresis to ignore DEM noise
  const sm = pts.map(([k], i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) { s += pts[j][1]; n++; }
    return [k, s / n] as [number, number];
  });
  let up = 0, down = 0, ref = sm[0][1];
  for (const [, e] of sm) {
    if (e - ref > 4) { up += e - ref; ref = e; }
    else if (ref - e > 4) { down += ref - e; ref = e; }
  }
  const every = Math.max(1, Math.ceil(sm.length / 160));
  const p = sm.filter((_, i) => i % every === 0 || i === sm.length - 1).map(([k, e]) => [Math.round(k * 1000) / 1000, Math.round(e)] as [number, number]);
  return { p, up: Math.round(up), down: Math.round(down) };
}
