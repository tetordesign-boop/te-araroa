// Painting helpers for background layers (Canvas 2D). Layers are painted once per shot, then the brush pass
// (Kuwahara, in layers.js) turns the strokes into flat painted patches. All randomness comes from rng(seed).
import { rng as makeRng, fbm1, fbm2, noise2, clamp, lerp } from "./time.js";

export const rng = makeRng;

/** Parse "#rrggbb" -> [r,g,b] 0..255. */
export function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function hex([r, g, b]) { return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join(""); }
/** Mix two hex colours. */
export function mix(a, b, k) { const A = rgb(a), B = rgb(b); return hex(A.map((x, i) => lerp(x, B[i], k))); }
/** Shift a colour: k>0 lighter toward white, k<0 darker toward black. */
export function shade(c, k) { return k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k); }
export function rgba(c, a) { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; }

/** Vertical gradient fill of a rect. stops = [[0,"#..."],[1,"#..."]] (0 = top). */
export function vgrad(g, x, y, w, h, stops) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  for (const [k, c] of stops) gr.addColorStop(k, c);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}
/** Radial glow. */
export function glow(g, x, y, r, color, alpha = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, alpha)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/**
 * Silhouette path from a height function: top(x) gives the canvas y of the ridge at canvas x. Closes to `bottom`.
 * Returns a Path2D (use for fill, clip and strokes).
 */
export function ridgePath(w, top, bottom, step = 3) {
  const p = new Path2D(); p.moveTo(-10, bottom); p.lineTo(-10, top(0));
  for (let x = 0; x <= w + step; x += step) p.lineTo(x, top(x));
  p.lineTo(w + 10, bottom); p.closePath(); return p;
}
/** Mountain-ish ridge function generator in canvas px: base y, amplitude, wavelength, seed, sharpness 0..1. */
export function ridgeFn({ base, amp, wave = 300, seed = 1, sharp = 0.5, oct = 5 }) {
  return (x) => {
    let n = fbm1(x / wave, oct, seed);
    const r = 1 - Math.abs(fbm1(x / (wave * 1.7), 3, seed + 9));      // ridged component for peaks
    n = lerp(n, r * 1.4 - 0.7, sharp);
    return base - n * amp;
  };
}

/**
 * Brush strokes clipped to a path: the painted texture. opts: count, len [min,max], width [min,max], colors[],
 * alpha [min,max], angle (radians, base direction) or angleAt(x,y), spread (radians), bounds {x,y,w,h},
 * density(x,y)->0..1 to thin strokes out, taper (0..1).
 */
export function strokes(g, clip, o, seed = 1) {
  const r = makeRng(seed); const b = o.bounds;
  g.save(); if (clip) g.clip(clip);
  for (let i = 0; i < o.count; i++) {
    const x = b.x + r() * b.w, y = b.y + r() * b.h;
    if (o.density && r() > o.density(x, y)) continue;
    const len = r.range(...(o.len || [10, 30])), wid = r.range(...(o.width || [2, 5]));
    const a = (o.angleAt ? o.angleAt(x, y) : (o.angle ?? 0)) + r.gauss() * (o.spread ?? 0.25);
    const c = typeof o.colors === "function" ? o.colors(x, y, r) : r.pick(o.colors);
    g.globalAlpha = r.range(...(o.alpha || [0.25, 0.6]));
    stroke(g, x, y, a, len, wid, c, o.taper ?? 0.6, r);
  }
  g.restore(); g.globalAlpha = 1;
}
/** One tapered, slightly curved brush stroke centred on (x,y). */
export function stroke(g, x, y, a, len, wid, color, taper = 0.6, r = Math.random) {
  const ca = Math.cos(a), sa = Math.sin(a), bend = (r() - 0.5) * 0.5 * len;
  const hx = (len / 2) * ca, hy = (len / 2) * sa, nx = -sa, ny = ca;
  const w0 = wid * (1 - taper * 0.8), w1 = wid;
  g.fillStyle = color; g.beginPath();
  g.moveTo(x - hx + nx * w0 * 0.5, y - hy + ny * w0 * 0.5);
  g.quadraticCurveTo(x + nx * (w1 + bend * 0.1), y + ny * (w1 + bend * 0.1), x + hx + nx * w0 * 0.3, y + hy + ny * w0 * 0.3);
  g.lineTo(x + hx - nx * w0 * 0.3, y + hy - ny * w0 * 0.3);
  g.quadraticCurveTo(x - nx * (w1 - bend * 0.1), y - ny * (w1 - bend * 0.1), x - hx - nx * w0 * 0.5, y - hy - ny * w0 * 0.5);
  g.closePath(); g.fill();
}
/** Irregular blob (foliage clump, cloud puff, rock). */
export function blob(g, x, y, rx, ry, color, seed = 1, wobble = 0.25, pts = 18) {
  const r = makeRng(seed); g.fillStyle = color; g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2, k = 1 + (noise2(Math.cos(a) * 1.3, Math.sin(a) * 1.3, seed) * wobble) + (r() - 0.5) * wobble * 0.3;
    const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill();
}
/**
 * Anime cumulus: stacked puffs, lit from `light` (unit 2D vector in canvas space, e.g. [0.6,-0.8] = from upper right):
 * shadow body, lit tops, a bright rim. colors = {shadow, mid, light, rim}.
 */
export function cloud(g, x, y, w, h, colors, seed = 1, puffs = 14, light = [0.4, -0.9]) {
  const r = makeRng(seed); const P = [];
  for (let i = 0; i < puffs; i++) {
    const u = r(), px = x + (u - 0.5) * w * 0.9, bump = Math.sin(u * Math.PI);
    const pr = (0.18 + 0.22 * bump) * Math.min(w, h * 2) * r.range(0.7, 1.15);
    P.push([px, y + h * 0.25 - bump * h * 0.45 * r.range(0.6, 1.1), pr]);
  }
  P.sort((a, b) => a[1] - b[1]);
  for (const [px, py, pr] of P) blob(g, px, py, pr, pr * 0.82, colors.shadow, seed + px, 0.18);
  for (const [px, py, pr] of P) blob(g, px + light[0] * pr * 0.18, py + light[1] * pr * 0.18, pr * 0.82, pr * 0.66, colors.mid, seed + py, 0.2);
  for (const [px, py, pr] of P) blob(g, px + light[0] * pr * 0.34, py + light[1] * pr * 0.34, pr * 0.55, pr * 0.42, colors.light, seed + pr, 0.22);
  if (colors.rim) {
    g.save(); g.globalAlpha = 0.7;
    for (const [px, py, pr] of P) blob(g, px + light[0] * pr * 0.52, py + light[1] * pr * 0.52, pr * 0.28, pr * 0.2, colors.rim, seed + 7 * pr, 0.3);
    g.restore();
  }
  // flat cloud base
  g.fillStyle = colors.shadow; g.fillRect(x - w * 0.42, y + h * 0.18, w * 0.84, h * 0.12);
}
/** Foliage mass: many leafy dabs, shadow below, lit on the light side. */
export function foliage(g, path, b, colors, seed = 1, n = 600, size = [6, 16], light = [0.5, -0.8]) {
  const r = makeRng(seed); g.save(); g.clip(path);
  for (const [layer, col, off] of [[0, colors.shadow, 0], [1, colors.mid, 0.25], [2, colors.light, 0.5]]) {
    for (let i = 0; i < n / (layer + 1); i++) {
      const x = b.x + r() * b.w, y = b.y + r() * b.h, s = r.range(...size) * (1 - layer * 0.2);
      blob(g, x + light[0] * s * off, y + light[1] * s * off, s, s * 0.7, col, seed * 31 + i + layer * 1000, 0.35, 9);
    }
  }
  g.restore();
}
/** Fine paper speckle so flat fills don't look digital. */
export function speckle(g, w, h, amount = 0.04, seed = 3, n = 12000) {
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${amount * r()})` : `rgba(0,0,0,${amount * r()})`;
    const s = r.range(0.6, 2.2); g.fillRect(r() * w, r() * h, s, s);
  }
}
export { fbm1, fbm2, noise2, clamp, lerp };
