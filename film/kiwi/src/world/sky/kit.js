// World B painting kit: sky gradients, anime cumulus, relief-shaded mountain ranges, mist, all painted with strokes
// in world terms (azimuth / elevation from the layer's mean camera) so layers line up across shots and aspects.
import { rgb, hex, mix, shade, rgba, stroke, blob } from "../../core/paint.js";
import { rng, clamp, lerp } from "../../core/time.js";

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const smoothstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// ------------------------------------------------------------------ fast deterministic gradient noise (per-pixel work)
/** Perlin-style 2D gradient noise with its own permutation table. Returns {n(x,y) in ~[-1,1], fbm(x,y,oct), ridged(x,y,oct)}. */
export function makeNoise(seed = 1) {
  const r = rng(seed * 7 + 3), P = new Uint8Array(512), GX = new Float32Array(256), GY = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = P[P[X] + Y], b = P[P[X + 1] + Y], c = P[P[X] + Y + 1], d = P[P[X + 1] + Y + 1];
    const ga = GX[a] * xf + GY[a] * yf, gb = GX[b] * (xf - 1) + GY[b] * yf, gc = GX[c] * xf + GY[c] * (yf - 1), gd = GX[d] * (xf - 1) + GY[d] * (yf - 1);
    return 1.41 * (ga + u * (gb - ga) + v * (gc + u * (gd - gc) - ga - u * (gb - ga)));
  };
  const fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * n(x * f + o * 17.3, y * f - o * 9.1); a *= 0.5; f *= 2.02; } return s; };
  const ridged = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * (1 - Math.abs(n(x * f + o * 31.7, y * f + o * 5.3))); a *= 0.5; f *= 2.02; } return s; };
  return { n, fbm, ridged };
}

// ------------------------------------------------------------------ colour
/** Sample a list of [key, hex] stops (keys ascending) at k. */
export function ramp(stops, k) {
  if (k <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (k <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (k - a) / (b - a || 1)); }
  return stops[stops.length - 1][1];
}
export const jitter = (c, r, amt = 0.05) => shade(c, (r() - 0.5) * 2 * amt);
export { rgb, hex, mix, shade, rgba };

// ------------------------------------------------------------------ world <-> canvas
/**
 * Angular frame of a layer: world azimuth (deg, 0 = -Z, + toward +X) and elevation (deg) from the layer's mean
 * camera. `at(az, el)` -> canvas px; `azAt(px)`; `elevAt(px, py)`; `rowAt(px, el)`; `proj([x,y,z])` -> canvas px.
 */
export function frame(L) {
  const azF = Math.atan2(L.F.x, -L.F.z) * R2D, cR = L.cam.dot(L.R);
  const F = {
    azF, L,
    at: (az, el) => { const a = (az - azF) * D2R; const s = cR + Math.tan(a) * L.depth; const y = L.cam.y + Math.tan(el * D2R) * L.depth / Math.cos(a); return [L.sx(s), L.yy(y)]; },
    azAt: (px) => azF + Math.atan((L.s(px) - cR) / L.depth) * R2D,
    elevAt: (px, py) => { const a = Math.atan((L.s(px) - cR) / L.depth); return Math.atan((L.y(py) - L.cam.y) * Math.cos(a) / L.depth) * R2D; },
    rowAt: (px, el) => { const a = Math.atan((L.s(px) - cR) / L.depth); return L.yy(L.cam.y + Math.tan(el * D2R) * L.depth / Math.cos(a)); },
    /** world point -> canvas px (projected onto the plane through the mean camera) */
    proj: ([x, y, z]) => {
      const dx = x - L.cam.x, dy = y - L.cam.y, dz = z - L.cam.z; const along = dx * L.F.x + dz * L.F.z; const k = L.depth / Math.max(1e-3, along);
      const s = cR + (dx * L.R.x + dz * L.R.z) * k; return [L.sx(s), L.yy(L.cam.y + dy * k)];
    },
    /** pixels per degree near the centre */
    ppd: L.ppm * L.depth * D2R,
  };
  return F;
}
/** Light direction (world `from` vector) expressed on the layer: [lx (+ = from the right), ly (+ = from above), lz (+ = from the viewer)]. */
export function layerLight(L, from) {
  const f = from.map((v) => v); const n = Math.hypot(...f); const [x, y, z] = f.map((v) => v / n);
  return [x * L.R.x + z * L.R.z, y, -(x * L.F.x + z * L.F.z)];
}

// ------------------------------------------------------------------ sky
/**
 * Painted sky: gradient by elevation + long soft horizontal strokes with slight value shifts (gouache wash).
 * stops: [[elevDeg, hex], ...] ascending. glows: [{az, el, r (deg), color, a}]
 */
export function paintSky(g, L, F, { stops, seed = 1, strokes = 1, glows = [], wash = 0.035, angle = 0 }) {
  const step = 4;
  for (let y = 0; y < L.h; y += step) {
    const el = F.elevAt(L.w / 2, y + step / 2); g.fillStyle = ramp(stops, el); g.fillRect(0, y, L.w, step + 1);
  }
  for (const gl of glows) {
    const [x, y] = F.at(gl.az, gl.el), r = gl.r * F.ppd;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(gl.color, gl.a ?? 0.8)); gr.addColorStop(0.35, rgba(gl.color, (gl.a ?? 0.8) * 0.45)); gr.addColorStop(1, rgba(gl.color, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // washes: long horizontal strokes picking up the local colour, lighter or darker
  const r = rng(seed), n = Math.round((L.w * L.h) / 2600 * strokes);
  const img = g.getImageData(0, 0, L.w, L.h).data;
  for (let i = 0; i < n; i++) {
    const x = r() * L.w, y = r() * L.h, k = (Math.floor(y) * L.w + Math.floor(x)) * 4;
    const c = hex([img[k], img[k + 1], img[k + 2]]);
    g.globalAlpha = r.range(0.25, 0.55);
    stroke(g, x, y, angle + r.gauss() * 0.04, r.range(60, 260), r.range(5, 16), shade(c, (r() - 0.5) * 2 * wash), 0.7, r);
  }
  g.globalAlpha = 1;
}

/** Stars (small dots, a few bright crosses), denser toward `band` if given. */
export function paintStars(g, L, F, { seed = 5, n = 1500, minEl = 2, color = "#E8EEFF", band }) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * L.w, y = r() * L.h; if (F.elevAt(x, y) < minEl + r() * 4) continue;
    const b = r() ** 3; g.globalAlpha = 0.25 + b * 0.75; g.fillStyle = color;
    const s = 0.8 + b * 2.2; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ clouds
/**
 * Anime cumulus: stacked puffs, flat shaded base, lit tops toward `light` (canvas 2D unit vector toward the light),
 * a bright rim, stroke texture. pal = {shadow, mid, light, rim, base}. Returns the puff list.
 */
export function cumulus(g, cx, cy, w, h, pal, seed = 1, { light = [0.45, -0.89], puffs = 18, rim = 0.75, tex = 1, flatBase = true } = {}) {
  const r = rng(seed); const P = [];
  for (let i = 0; i < puffs; i++) {
    const u = r.range(-1, 1), prof = Math.pow(Math.max(0, 1 - u * u), 0.6);
    const pr = w * r.range(0.1, 0.2) * (0.55 + 0.6 * prof);
    const py = cy - prof * h * r.range(0.35, 0.85) + pr * 0.4;
    P.push([cx + u * w * 0.42, py, pr]);
  }
  // a few crowning towers
  for (let i = 0; i < Math.round(puffs / 5); i++) { const u = r.range(-0.4, 0.4); P.push([cx + u * w * 0.4, cy - h * r.range(0.7, 1.0), w * r.range(0.08, 0.13)]); }
  P.sort((a, b) => b[1] - a[1]);
  const baseY = cy + h * 0.12;
  g.save();
  if (flatBase) { g.beginPath(); g.rect(cx - w, cy - h * 3, w * 2, h * 3 + (baseY - cy)); g.clip(); }
  for (const [px, py, pr] of P) blob(g, px, py, pr, pr * 0.86, pal.shadow, seed + px * 0.37, 0.16, 20);
  for (const [px, py, pr] of P) {
    const k = clamp(1.25 - (py - (cy - h)) / (h * 1.3)); if (k <= 0.05) continue;
    blob(g, px + light[0] * pr * 0.18, py + light[1] * pr * 0.18, pr * (0.55 + 0.3 * k), pr * (0.48 + 0.26 * k), pal.mid, seed + py * 0.71, 0.2, 18);
  }
  for (const [px, py, pr] of P) {
    const k = clamp(1.1 - (py - (cy - h)) / (h * 1.2)); if (k <= 0.15) continue;
    blob(g, px + light[0] * pr * 0.36, py + light[1] * pr * 0.36, pr * 0.5 * k + pr * 0.1, pr * 0.4 * k + pr * 0.08, pal.light, seed + pr * 1.3, 0.24, 16);
  }
  if (pal.rim && rim > 0) {
    g.globalAlpha = rim;
    for (const [px, py, pr] of P) blob(g, px + light[0] * pr * 0.58, py + light[1] * pr * 0.58, pr * 0.26, pr * 0.18, pal.rim, seed + 7 * pr, 0.3, 12);
    g.globalAlpha = 1;
  }
  if (tex > 0) {   // curved texture strokes following the puffs
    for (const [px, py, pr] of P) for (let j = 0; j < 5 * tex; j++) {
      const a = r.range(-Math.PI, 0), rr = pr * r.range(0.4, 0.9), x = px + Math.cos(a) * rr, y = py + Math.sin(a) * rr * 0.8;
      const lit = Math.cos(a) * light[0] + Math.sin(a) * light[1];
      g.globalAlpha = r.range(0.25, 0.5);
      stroke(g, x, y, a + Math.PI / 2, pr * r.range(0.3, 0.6), pr * r.range(0.05, 0.1), lit > 0.3 ? pal.light : lit > -0.2 ? pal.mid : pal.shadow, 0.7, r);
    }
    g.globalAlpha = 1;
  }
  g.restore();
  if (flatBase && pal.base) {   // flat base band, slightly reflected-light coloured
    g.fillStyle = pal.base; const left = Math.min(...P.map((p) => p[0] - p[2] * 0.7)), right = Math.max(...P.map((p) => p[0] + p[2] * 0.7));
    g.globalAlpha = 0.85; blob(g, (left + right) / 2, baseY - h * 0.02, (right - left) / 2, h * 0.05, pal.base, seed + 99, 0.12, 24); g.globalAlpha = 1;
  }
  return P;
}

/** Flat stratus / wind-torn band: elongated blobs with a lit edge on the light side. pal = {shadow, mid, light}. */
export function stratus(g, cx, cy, w, h, pal, seed = 1, { light = [0.3, -0.95], n = 14, tear = 0.4, angle = 0 } = {}) {
  const r = rng(seed); const ca = Math.cos(angle), sa = Math.sin(angle);
  const P = [];
  for (let i = 0; i < n; i++) {
    const u = r.range(-1, 1), v = r.gauss() * 0.25; const rx = w * r.range(0.08, 0.22) * (1 - 0.5 * Math.abs(u)), ry = h * r.range(0.25, 0.6) * (1 - 0.4 * Math.abs(u));
    const x = cx + (u * w * 0.5) * ca - v * h * sa, y = cy + (u * w * 0.5) * sa + v * h * ca;
    P.push([x, y, rx, ry]);
  }
  for (const [x, y, rx, ry] of P) blob(g, x, y, rx, ry, pal.shadow, seed + x, 0.22, 22);
  for (const [x, y, rx, ry] of P) blob(g, x + light[0] * ry * 0.35, y + light[1] * ry * 0.35, rx * 0.85, ry * 0.6, pal.mid, seed + y, 0.25, 20);
  for (const [x, y, rx, ry] of P) if (r() < 0.75) blob(g, x + light[0] * ry * 0.6 + rx * r.range(-0.3, 0.3), y + light[1] * ry * 0.6, rx * r.range(0.3, 0.6), ry * 0.22, pal.light, seed + rx, 0.3, 16);
  // torn wisps trailing along the band
  for (let i = 0; i < n * tear * 3; i++) {
    const [x, y, rx, ry] = r.pick(P); g.globalAlpha = r.range(0.2, 0.5);
    stroke(g, x + r.range(-rx, rx), y + r.range(-ry, ry) * 0.6, angle + r.gauss() * 0.05, rx * r.range(0.6, 1.6), ry * r.range(0.15, 0.4), r() < 0.5 ? pal.mid : pal.shadow, 0.9, r);
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ mountains
/**
 * Relief-shaded mountain range on a layer. The silhouette `top(px)` -> canvas y; inside, faces are oriented by the
 * smoothed silhouette slope (big light/shadow planes under each peak) plus ridged-noise ribs and gullies that run down
 * the fall line, then quantised to painted tones, snow above a snow line, haze toward the base, rim light on the crest,
 * and fall-line brush strokes on top.
 * o = { top, bottom, pal:{lit, mid, shade, deep, snowLit, snowMid, snowShade, haze, rim}, light:[lx,ly,lz],
 *       snow(px,py,depthPx)->0..1, haze(px,py,depthPx)->0..1, scale (px), seed, f (low-res factor), strokes, ribs,
 *       thresh:[t0,t1], rimW, rimAll, x0, x1, clipTo (Path2D: extra clip) }
 */
export function paintRange(g, L, o) {
  const W = L.w, f = o.f ?? 3, x0 = o.x0 ?? 0, x1 = o.x1 ?? W, pad = 900;
  const N = makeNoise(o.seed ?? 1), r = rng((o.seed ?? 1) * 13 + 1);
  const scale = o.scale ?? 120, pal = o.pal, [lx, ly, lz] = o.light ?? [0.6, 0.5, 0.6];
  const [t0, t1] = o.thresh ?? [0.28, 0.62];
  const bottom = o.bottom ?? L.h;
  // silhouette, sampled every f px with padding (for the wide slope windows)
  const nT = Math.ceil((x1 - x0 + 2 * pad) / f) + 2, T = new Float32Array(nT);
  for (let i = 0; i < nT; i++) T[i] = o.top(x0 - pad + i * f);
  const Ti = (x) => { const u = (x - x0 + pad) / f, i = clamp(Math.floor(u), 0, nT - 2), k = clamp(u - i, 0, 1); return T[i] * (1 - k) + T[i + 1] * k; };
  let minT = Infinity; for (let x = x0; x <= x1; x += f) minT = Math.min(minT, Ti(x));
  minT = Math.max(0, Math.floor(minT) - 4);
  const cw = Math.ceil((x1 - x0) / f) + 1, ch = Math.ceil((bottom - minT) / f) + 1;
  if (ch <= 1 || cw <= 1) return;
  const buf = new Uint8ClampedArray(cw * ch * 4), info = new Float32Array(cw * ch * 2);
  const C = (c) => rgb(c);
  const P = { lit: C(pal.lit), mid: C(pal.mid), shade: C(pal.shade), deep: C(pal.deep ?? shade(pal.shade, -0.2)), sl: C(pal.snowLit ?? pal.lit), sm: C(pal.snowMid ?? pal.snowLit ?? pal.mid), ss: C(pal.snowShade ?? pal.shade), hz: C(pal.haze ?? pal.mid) };
  const ribAmt = o.ribs ?? 0.9;
  for (let j = 0; j < ch; j++) {
    const py = minT + j * f;
    for (let i = 0; i < cw; i++) {
      const px = x0 + i * f, top = Ti(px), d = py - top, k4 = (j * cw + i) * 4;
      if (d < -f) { buf[k4 + 3] = 0; continue; }
      const dd = Math.max(0, d);
      const w = Math.min(420, 10 + dd * 0.75);
      const sl = (Ti(px + w) - Ti(px - w)) / (2 * w);                                   // dy/dx of the smoothed crest
      const u = (px + sl * dd * 0.55) / scale, v = py / (scale * 2.4);
      const rib = N.ridged(u, v, 4), ribR = N.ridged(u + 0.06, v, 4);
      const ribG = (ribR - rib) / 0.06;                                                  // + = rising to the right
      const deepen = smoothstep(0, scale * 0.5, dd);
      let nx = clamp(sl * 1.7 - ribG * 0.09 * ribAmt * deepen, -0.95, 0.95);
      let ny = 0.32 + 0.22 * N.n(px / (scale * 0.7), py / (scale * 0.35)) - 0.15 * deepen;
      const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
      let I;
      if (o.lightAt) { const l = o.lightAt(px); I = nx * l[0] + ny * l[1] + nz * l[2]; } else I = nx * lx + ny * ly + nz * lz;
      I += 0.06 * N.n(px / 9, py / 9);                                                   // broken tone edges
      const gully = rib < 0.55 ? (0.55 - rib) * 2 : 0;
      const snow = o.snow ? o.snow(px, py, dd, ny + 0.4 * (rib - 0.6)) : 0;
      let c;
      if (snow > 0.5) c = I > t1 ? P.sl : I > t0 ? P.sm : P.ss;
      else { c = I > t1 ? P.lit : I > t0 ? P.mid : P.shade; if (I < t0 && gully * deepen > 0.35) c = P.deep; }
      let hz = o.haze ? clamp(o.haze(px, py, dd)) : 0;
      buf[k4] = c[0] + (P.hz[0] - c[0]) * hz; buf[k4 + 1] = c[1] + (P.hz[1] - c[1]) * hz; buf[k4 + 2] = c[2] + (P.hz[2] - c[2]) * hz; buf[k4 + 3] = 255;
      info[(j * cw + i) * 2] = nx; info[(j * cw + i) * 2 + 1] = I;
    }
  }
  const off = document.createElement("canvas"); off.width = cw; off.height = ch;
  off.getContext("2d").putImageData(new ImageData(buf, cw, ch), 0, 0);
  const path = new Path2D(); path.moveTo(x0 - 4, bottom + 4); for (let x = x0 - 4; x <= x1 + f; x += f) path.lineTo(x, Ti(x)); path.lineTo(x1 + 4, bottom + 4); path.closePath();
  g.save(); g.clip(path); if (o.clipTo) g.clip(o.clipTo);
  g.imageSmoothingEnabled = true; g.drawImage(off, x0, minT, cw * f, ch * f);
  // fall-line strokes in the local tone
  const n = Math.round(((x1 - x0) * (bottom - minT)) / 140 * (o.strokes ?? 1));
  for (let s = 0; s < n; s++) {
    const px = x0 + r() * (x1 - x0), py = minT + r() * (bottom - minT), top = Ti(px); if (py < top + 1) continue;
    const i = Math.floor((px - x0) / f), j = Math.floor((py - minT) / f); if (i < 0 || j < 0 || i >= cw || j >= ch) continue;
    const k = (j * cw + i) * 4; if (!buf[k + 3]) continue;
    const nx = info[(j * cw + i) * 2];
    const c = hex([buf[k], buf[k + 1], buf[k + 2]]);
    g.globalAlpha = r.range(0.35, 0.75);
    const len = r.range(4, 14) * f * (o.strokeLen ?? 1);
    stroke(g, px, py, Math.atan2(1, nx * 1.4) + r.gauss() * 0.18, len, r.range(1.2, 3) * f * (o.strokeW ?? 1), shade(c, (r() - 0.5) * 0.08), 0.7, r);
  }
  g.globalAlpha = 1;
  g.restore();
  // rim light on the crest where the face turns toward the light (or everywhere when back-lit)
  if (pal.rim && (o.rimW ?? 0) > 0) {
    g.save(); g.lineJoin = "round"; g.lineCap = "round";
    for (let x = x0; x < x1; x += f) {
      const sl = (Ti(x + 12) - Ti(x - 12)) / 24, face = clamp(sl * 1.7) * (o.lightAt ? o.lightAt(x)[0] : lx);
      const a = o.rimAll ? 0.85 : smoothstep(0.0, 0.25, face + 0.05);
      if (a <= 0.02) continue;
      g.strokeStyle = rgba(pal.rim, a); g.lineWidth = o.rimW * (0.6 + 0.6 * Math.abs(N.n(x / 40, 3.3)));
      g.beginPath(); g.moveTo(x, Ti(x) + o.rimW * 0.4); g.lineTo(x + f, Ti(x + f) + o.rimW * 0.4); g.stroke();
    }
    g.restore();
  }
  return { top: Ti, path };
}

/** Mountain silhouette generator in world angles: returns el(az). peaks: [{az, el, w (half width deg), wl?, wr?, pow?}]. */
export function rangeProfile({ base = 1, peaks = [], amp = 2, wave = 12, seed = 1, sharp = 0.6, oct = 5, jag = 0.22 }) {
  const N = makeNoise(seed), floor = base - 0.6 * Math.abs(base);
  return (az) => {
    let e = base + amp * (0.5 * N.fbm(az / wave, 0.37, oct) + sharp * (N.ridged(az / (wave * 1.6), 1.7, 4) - 0.6));
    for (const p of peaks) {
      const d = az - p.az, w = d < 0 ? (p.wl ?? p.w) : (p.wr ?? p.w), k = Math.max(0, 1 - Math.abs(d) / w);
      const shape = Math.pow(k, p.pow ?? 1.6) * (1 + 0.12 * N.fbm(az / 1.7, p.az * 0.1, 3));
      e = Math.max(e, floor + p.el * shape);
    }
    // jagged crest detail, stronger on the high peaks
    return e + Math.max(0, e - floor) * jag * (N.ridged(az / 0.9, 5.5, 4) - 0.55) + 0.05 * N.n(az / 0.25, 2.2);
  };
}

/** Soft horizontal mist band: many wide translucent strokes. */
export function mistBand(g, L, { y, h, color, seed = 9, n = 120, alpha = [0.08, 0.22], x0 = 0, x1 = L.w, len = [200, 700] }) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = r.range(...alpha);
    stroke(g, x0 + r() * (x1 - x0), y + r.gauss() * h * 0.35, r.gauss() * 0.02, r.range(...len), r.range(0.3, 1) * h * 0.5, color, 0.9, r);
  }
  g.globalAlpha = 1;
}

/** Fill the canvas region under a silhouette with a vertical gradient (for ground / far valleys) + strokes. */
export function silhouetteFill(g, L, top, bottom, stops, { seed = 3, strokes = 1, angle = 0, len = [20, 80], width = [3, 9], wash = 0.06, x0 = 0, x1 = L.w, step = 3 } = {}) {
  const p = new Path2D(); p.moveTo(x0 - 4, bottom + 4); for (let x = x0 - 4; x <= x1 + step; x += step) p.lineTo(x, top(x)); p.lineTo(x1 + 4, bottom + 4); p.closePath();
  let minT = Infinity; for (let x = x0; x <= x1; x += step) minT = Math.min(minT, top(x));
  g.save(); g.clip(p);
  const gr = g.createLinearGradient(0, minT, 0, bottom); for (const [k, c] of stops) gr.addColorStop(k, c);
  g.fillStyle = gr; g.fillRect(x0, minT, x1 - x0, bottom - minT);
  const r = rng(seed), n = Math.round(((x1 - x0) * (bottom - minT)) / 500 * strokes);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = minT + r() * (bottom - minT); const k = clamp((y - minT) / (bottom - minT));
    g.globalAlpha = r.range(0.3, 0.6);
    stroke(g, x, y, angle + r.gauss() * 0.15, r.range(...len), r.range(...width), shade(ramp(stops, k), (r() - 0.5) * 2 * wash), 0.7, r);
  }
  g.globalAlpha = 1; g.restore();
  return p;
}
