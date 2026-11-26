// World A (land) painting kit: world-anchored mapping for layers + painterly helpers (skies, cumulus, bush ridges,
// mirrored water, rain veils). Pure Canvas 2D, deterministic (rng(seed) only).
import { rng, rgb, hex, mix, shade, rgba, blob, stroke, strokes } from "../../core/paint.js";
import { fbm1, fbm2, noise1, noise2, clamp, lerp, smooth, hash } from "../../core/time.js";

export { rng, rgb, hex, mix, shade, rgba, blob, stroke, strokes, fbm1, fbm2, noise1, noise2, clamp, lerp, smooth, hash };
const D2R = Math.PI / 180;

/**
 * World-anchored mapping for a layer: azimuth (deg, 0 = looking -Z, + = toward +X) and true distances, so features
 * stay put across shots whose cameras look in different directions.
 */
export function wmap(L) {
  const C = L.cam, F = L.F, R = L.R, sC = C.x * R.x + C.z * R.z;
  const M = {
    L, C,
    /** px per degree near the centre of the layer */
    dpx: L.ppm * L.depth * D2R,
    az(x) { const u = L.s(x) - sC; return Math.atan2(F.x * L.depth + R.x * u, -(F.z * L.depth + R.z * u)) / D2R; },
    /** horizontal distance from the mean camera to the plane in column x */
    dist(x) { const u = L.s(x) - sC; return Math.hypot(L.depth, u); },
    /** canvas x of a world azimuth */
    x(az) {
      const dx = Math.sin(az * D2R), dz = -Math.cos(az * D2R), dF = dx * F.x + dz * F.z;
      if (dF <= 0.02) return az > 0 ? L.w * 4 : -L.w * 3;
      const t = L.depth / dF; return L.sx(sC + t * (dx * R.x + dz * R.z));
    },
    /** canvas y of a point at height h (m) at true horizontal distance D (m), in column x */
    y(x, h, D) { return L.yy(C.y + (h - C.y) * M.dist(x) / D); },
    /** canvas y for an elevation angle (deg) in column x */
    el(x, e) { return L.yy(C.y + Math.tan(e * D2R) * M.dist(x)); },
    /** elevation (deg) of canvas (x, y) */
    elOf(x, y) { return Math.atan((L.y(y) - C.y) / M.dist(x)) / D2R; },
    /** canvas point for (azimuth, elevation) */
    p(az, e) { const x = M.x(az); return [x, M.el(x, e)]; },
    /** canvas y of the water line (h = 0) far away */
    get horizon() { return L.yy(C.y - C.y * 1); },
  };
  return M;
}

/** Vertical gradient over the whole canvas by elevation: stops = [[elevDeg, colour], ...] (any order). */
export function skyGrad(g, L, M, stops, x = L.w / 2) {
  const s = [...stops].sort((a, b) => b[0] - a[0]).map(([e, c]) => [M.el(x, e), c]);
  const y0 = Math.min(...s.map((v) => v[0])), y1 = Math.max(...s.map((v) => v[0]));
  const gr = g.createLinearGradient(0, y0, 0, y1 === y0 ? y0 + 1 : y1);
  for (const [y, c] of s) gr.addColorStop(clamp((y - y0) / (y1 - y0 || 1)), c);
  g.fillStyle = gr; g.fillRect(0, 0, L.w, L.h);
}

/** Soft radial glow (alpha falloff). */
export function glow(g, x, y, r, color, a = 1, k = 0) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a)); if (k) gr.addColorStop(k, rgba(color, a * 0.55)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** Smooth horizontal haze band centred at y (height h). */
export function band(g, w, y, h, color, a) {
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.5, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, y - h / 2, w, h);
}

/** Horizontal painterly streaks over a region (sky texture, water ripples). */
export function hstreaks(g, b, n, colors, seed, { len = [40, 160], width = [2, 6], alpha = [0.08, 0.25], spread = 0.04, angle = 0, density } = {}) {
  strokes(g, null, { count: n, len, width, colors, alpha, angle, spread, bounds: b, taper: 0.9, density }, seed);
}

/**
 * Anime cumulus (cauliflower): big puffs along a dome, medium and small bulges budding on their upper edges. Flat
 * tones: shadow body, mid / lit / highlight caps on puffs exposed to the light, creases inside, flat darker base.
 * pal = {shadow, mid, lit, hi?, base?}. light = canvas direction toward the light.
 */
export function cumulus(g, cx, cy, w, h, pal, seed = 1, light = [0.6, -0.8], o = {}) {
  const r = rng(seed); const P = [];
  const tw = []; for (let i = 0; i < (o.towers ?? 2); i++) tw.push([r.range(0.25, 0.75), r.range(0.4, 1.0), r.range(0.006, 0.025)]);
  const prof = (u) => { let v = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.9) * 0.55; for (const [c, k, s] of tw) v += k * 0.45 * Math.exp(-((u - c) ** 2) / s); return Math.min(1, v); };
  const baseY = cy + h / 2;
  const nb = Math.max(3, Math.round((w / Math.max(h, 1)) * 2.2));
  for (let i = 0; i < nb; i++) {
    const u = clamp((i + 0.5 + r.range(-0.3, 0.3)) / nb, 0.04, 0.96), top = Math.max(h * 0.25, prof(u) * h);
    const R = Math.max(h * 0.16, Math.min(top * 0.55, w / nb * 0.75));
    P.push([cx + (u - 0.5) * w, baseY - top + R, R, 0]);
    if (top > R * 2.2) P.push([cx + (u - 0.5) * w + r.range(-R, R) * 0.4, baseY - R * 0.7, R * r.range(0.9, 1.2), 0]);
  }
  const big = P.slice();
  for (const [x, y, R] of big) for (let k = 0; k < (o.buds ?? 5); k++) {
    const a = -Math.PI / 2 + r.range(-1.5, 1.5), m = R * r.range(0.32, 0.55);
    const px = x + Math.cos(a) * (R - m * 0.35), py = y + Math.sin(a) * (R - m * 0.35); P.push([px, py, m, 1]);
    for (let j = 0; j < 2; j++) { const b2 = a + r.range(-1.2, 1.2), sm = m * r.range(0.35, 0.55); P.push([px + Math.cos(b2) * (m - sm * 0.3), py + Math.sin(b2) * (m - sm * 0.3), sm, 2]); }
  }
  const [lx, ly] = light, ell = (p, x, y, rr) => { p.moveTo(x + rr, y); p.ellipse(x, y, rr, rr * 0.88, 0, 0, Math.PI * 2); };
  const sil = new Path2D(); for (const [x, y, rr] of P) ell(sil, x, y, rr);
  { // solid flat-bottomed body under the big puffs
    const xs = big.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), bh = Math.min(h * 0.4, Math.min(...big.map((p) => p[2])) * 1.2);
    sil.moveTo(x0, baseY); sil.roundRect(x0 - big[0][2] * 0.4, baseY - bh, x1 - x0 + big[0][2] * 0.8, bh + 2, [bh * 0.5, bh * 0.5, 0, 0]);
  }
  g.save();
  const clipP = new Path2D(); clipP.rect(cx - w * 2, cy - h * 4, w * 4, baseY - (cy - h * 4)); g.clip(clipP);
  g.save(); g.clip(sil);
  // tone bands from the silhouette shifted away from the light: lit edge, mid, shadow core (scallops follow the puffs)
  const dL = h * (o.litW ?? 0.13), dM = h * (o.midW ?? 0.3);
  g.fillStyle = pal.lit; g.fill(sil);
  g.save(); g.translate(-lx * dL, -ly * dL); g.fillStyle = pal.mid; g.fill(sil); g.restore();
  g.save(); g.translate(-lx * dM, -ly * dM); g.fillStyle = pal.shadow; g.fill(sil); g.restore();
  let gr = g.createLinearGradient(0, baseY - h, 0, baseY); gr.addColorStop(0, rgba(pal.mid, 0.0)); gr.addColorStop(1, rgba(pal.base ?? pal.shadow, 0.55));
  g.fillStyle = gr; g.fillRect(cx - w, baseY - h * 1.2, w * 2, h * 1.2);
  // interior bulges: soft lighter crescents on their light side; bright caps on exposed buds
  const exposed = P.map(([x, y, rr]) => !g.isPointInPath(sil, x + lx * rr * 1.15, y + ly * rr * 1.15));
  P.forEach(([x, y, rr, lev], i) => {
    if (exposed[i]) { if (pal.hi && lev > 0) { g.globalAlpha = 0.55; blob(g, x + lx * rr * 0.45, y + ly * rr * 0.45, rr * 0.4, rr * 0.3, pal.hi, seed + i, 0.25, 10); } return; }
    if (r() < 0.7) return;
    g.save(); const cp = new Path2D(); cp.moveTo(x + rr, y); cp.ellipse(x, y, rr, rr * 0.88, 0, 0, Math.PI * 2); g.clip(cp);
    g.globalAlpha = r.range(0.12, 0.22); g.fillStyle = pal.mid;
    g.beginPath(); g.ellipse(x + lx * rr * 0.35, y + ly * rr * 0.35, rr * 0.8, rr * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  });
  g.globalAlpha = 1;
  // flat, darker base
  gr = g.createLinearGradient(0, baseY - h * 0.28, 0, baseY); gr.addColorStop(0, rgba(pal.base ?? pal.shadow, 0)); gr.addColorStop(1, rgba(pal.base ?? pal.shadow, 0.9));
  g.fillStyle = gr; g.fillRect(cx - w * 2, baseY - h * 0.28, w * 4, h * 0.28);
  if (o.underGlow) { gr = g.createLinearGradient(0, baseY - h * 0.12, 0, baseY); gr.addColorStop(0, rgba(o.underGlow, 0)); gr.addColorStop(1, rgba(o.underGlow, 0.8)); g.fillStyle = gr; g.fillRect(cx - w * 2, baseY - h * 0.12, w * 4, h * 0.12); }
  g.restore(); g.restore();
  return { baseY, puffs: P };
}

/**
 * A field of cumulus in perspective: clouds at altitude A (m) and distance D (m) shrink and flatten toward the
 * horizon. o = {n, seed, az:[a0,a1], D:[d0,d1], alt:[..], W:[..], H:[..], pal(D, cloud) -> palette, sun:[x,y] canvas,
 * skip(az, elBase) -> bool}
 */
export function cloudField(g, L, M, o) {
  const r = rng(o.seed ?? 1); const C = [];
  for (let i = 0; i < o.n; i++) {
    const D = Math.exp(r.range(Math.log(o.D[0]), Math.log(o.D[1]))), az = r.range(...o.az);
    const A = r.range(...o.alt), W = r.range(...o.W), H = r.range(...o.H) * (r() < (o.tall ?? 0.3) ? 1.8 : 1);
    const eb = Math.atan(A / D) / D2R; if (o.skip?.(az, eb)) continue;
    C.push({ D, az, A, W, H, eb });
  }
  C.sort((a, b) => b.D - a.D);
  for (const c of C) {
    const x = M.x(c.az); if (x < -L.w || x > 2 * L.w) continue;
    const yb = M.el(x, c.eb), yt = M.el(x, Math.atan((c.A + c.H) / c.D) / D2R);
    const wpx = Math.min((c.W / c.D) / D2R, o.maxW ?? 20) * M.dpx; const hpx = Math.min(yb - yt, wpx * 0.6); if (hpx < 3) continue;
    let lt = o.light ?? [0.6, -0.8];
    if (o.sun) { const dx = clamp((o.sun[0] - x) / (L.w * 0.4), -1, 1); lt = [dx * 0.75, -0.75]; const n2 = Math.hypot(...lt); lt = [lt[0] / n2, lt[1] / n2]; }
    cumulus(g, x, (yb + yt) / 2, wpx, hpx, o.pal(c.D, c), Math.floor(c.D + c.az * 100), lt, { towers: c.H > 1500 ? 3 : 2, buds: hpx > 120 ? 6 : 4, underGlow: o.underGlow?.(c) });
  }
}

/** Thin stratus / cloud streak: a long tapered horizontal smear made of strokes. */
export function streakCloud(g, cx, cy, w, h, colors, seed, a = 0.5) {
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const u = r.gauss() * 0.25, x = cx + u * w, y = cy + r.gauss() * h * 0.3;
    g.globalAlpha = a * r.range(0.3, 0.8) * (1 - Math.min(1, Math.abs(u) * 2));
    stroke(g, x, y, r.range(-0.03, 0.03), w * r.range(0.2, 0.5), h * r.range(0.3, 0.8), r.pick(colors), 0.9, r);
  }
  g.globalAlpha = 1;
}

/**
 * A ridge (hill/mountain line) seen at distance D, profile hFn(az) in metres. Returns {path, top(x)} in canvas px.
 * The silhouette carries tree-crown bumps when crown > 0 (metres).
 */
export function ridge(L, M, D, hFn, { crown = 0, crownWave = 12, seed = 1, bottom } = {}) {
  const top = (x) => {
    const az = M.az(x); let h = hFn(az);
    if (crown > 0) { const s = (az * D2R) * D / crownWave; h += Math.abs(noise1(s, seed)) * crown + Math.abs(noise1(s * 2.7, seed + 3)) * crown * 0.35; }
    return M.y(x, h, D);
  };
  const p = new Path2D(); const b = bottom ?? M.y(L.w / 2, 0, D) + 2; const step = 2;
  p.moveTo(-10, b); for (let x = -10; x <= L.w + 10; x += step) p.lineTo(x, Math.min(top(x), b)); p.lineTo(L.w + 10, b); p.closePath();
  return { path: p, top, bottom: b };
}

/**
 * Paint a bush-clad hill mass: gradient base, spur light/shadow streaks running down from the ridge (lit where the
 * ridge descends toward the light), soft canopy dabs, ridge rim light, foot haze.
 * col = {base, shadow, mid, lit, rim?, haze?}; light +1 = from the right, -1 = from the left.
 */
export function bushHill(g, L, rd, col, seed, { light = 1, dab = 5, n = 3000, rimA = 0.5, hazeH = 0.35, spur = 1, dabA = [0.15, 0.4], spurA = [0.25, 0.5], top = 0 } = {}) {
  const r = rng(seed); const { path } = rd; const yb = rd.bottom;
  const tops = []; for (let x = -8; x <= L.w + 8; x += 2) tops.push(rd.top(x));
  const T = (x) => tops[clamp(Math.round((x + 8) / 2), 0, tops.length - 1)];
  const ymin = top || Math.min(...tops);
  const slope = (x, k = 14) => (T(x + k) - T(x - k)) / (2 * k);   // > 0: the ridge descends to the right
  g.save(); g.clip(path);
  let gr = g.createLinearGradient(0, ymin, 0, yb); gr.addColorStop(0, col.base); gr.addColorStop(1, col.haze ? mix(col.base, col.haze, 0.3) : col.base);
  g.fillStyle = gr; g.fillRect(-10, ymin - 5, L.w + 20, yb - ymin + 10);
  // spurs: long streaks from the ridge down the slope
  if (spur > 0) {
    for (let x = -20; x < L.w + 20; x += r.range(2, 5)) {
      const t = T(x); if (t >= yb - 2) continue;
      const s = slope(x) * light + noise1(x / 40, seed) * 0.15;
      const c = s > 0.06 ? col.lit : s < -0.06 ? col.shadow : (r() < 0.5 ? col.mid : null); if (!c) continue;
      const len = (yb - t) * r.range(0.3, 0.95) * spur, a = Math.PI / 2 - light * Math.sign(s) * r.range(0.15, 0.55);
      g.globalAlpha = r.range(...spurA) * Math.min(1, Math.abs(s) * 6 + 0.3);
      stroke(g, x + Math.cos(a) * len * 0.5, t + Math.sin(a) * len * 0.5, a, len, r.range(3, 7) * dab * 0.35, c, 0.85, r);
    }
  }
  // canopy texture: small rounded dabs, low contrast, denser near the ridge
  for (let i = 0; i < n; i++) {
    const x = r() * L.w, ty = T(x); if (ty >= yb) continue;
    const k = Math.pow(r(), 1.5), y = ty + dab * 0.6 + k * (yb - ty);
    const s = slope(x) * light, lit = clamp(0.5 + s * 2 + noise2(x / 70, y / 50, seed) * 0.35 - k * 0.2);
    g.globalAlpha = r.range(...dabA);
    const sz = dab * r.range(0.6, 1.3);
    blob(g, x, y, sz, sz * 0.7, lit > 0.66 ? col.lit : lit > 0.4 ? col.mid : col.shadow, seed * 13 + i, 0.4, 8);
    if (lit > 0.5 && r() < 0.5) { g.globalAlpha *= 0.8; blob(g, x + sz * 0.3, y - sz * 0.35, sz * 0.5, sz * 0.32, col.lit, seed * 17 + i, 0.4, 7); }
  }
  g.globalAlpha = 1;
  if (col.rim && rimA > 0) {
    g.lineWidth = Math.max(1.5, dab * 0.5); g.strokeStyle = col.rim; g.lineCap = "round";
    for (let x = 0; x < L.w; x += 3) {
      const s = slope(x, 6) * light; if (s < 0.03) continue;
      g.globalAlpha = clamp(s * 6) * rimA; g.beginPath(); g.moveTo(x, T(x) + 1); g.lineTo(x + 3, T(x + 3) + 1); g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (col.haze) { const hh = (yb - ymin) * hazeH; gr = g.createLinearGradient(0, yb - hh, 0, yb); gr.addColorStop(0, rgba(col.haze, 0)); gr.addColorStop(1, rgba(col.haze, 0.8)); g.fillStyle = gr; g.fillRect(0, yb - hh, L.w, hh + 2); }
  g.restore();
}

/**
 * Mirror everything above canvas row `yLine` into the water below it, with ripple displacement, darkening and a tint.
 * o = {tint, tintA, dark, ripple (px), wave (px), seed, fade (px: reflection fades out over this many px below yLine)}
 */
export function reflect(g, L, yLine, o = {}) {
  const src = document.createElement("canvas"); src.width = L.w; src.height = L.h;
  const sg = src.getContext("2d"); sg.drawImage(g.canvas, 0, 0);
  g.save(); g.clearRect(0, yLine, L.w, L.h - yLine);
  const step = 2, seed = o.seed ?? 5, rip = o.ripple ?? 6, wave = o.wave ?? 40;
  for (let y = Math.floor(yLine); y < L.h; y += step) {
    const d = y - yLine; const sy = yLine - d; if (sy < 0) break;
    const k = d / Math.max(1, (L.h - yLine));
    const dx = noise1(y / wave, seed) * rip * (0.3 + k * 1.4) + noise1(y / 3.1, seed + 9) * rip * 0.35 * (0.2 + k);
    const sq = o.squash ?? 1;                              // reflections a touch shorter
    const syy = yLine - d / sq;
    g.drawImage(src, 0, Math.max(0, syy), L.w, step / sq + 0.5, dx, y, L.w, step);
  }
  g.restore();
  // darken + tint the reflection
  g.save(); g.globalCompositeOperation = "source-atop";
  if (o.tint) { const gr = g.createLinearGradient(0, yLine, 0, L.h); gr.addColorStop(0, rgba(o.tint, o.tintA0 ?? (o.tintA ?? 0.25) * 0.6)); gr.addColorStop(1, rgba(o.tint, o.tintA ?? 0.25)); g.fillStyle = gr; g.fillRect(0, yLine, L.w, L.h - yLine); }
  if (o.dark) { g.fillStyle = `rgba(0,0,0,${o.dark})`; g.fillRect(0, yLine, L.w, L.h - yLine); }
  g.restore();
}

/** Ripple lines on water: thin horizontal light/dark strokes, denser and thinner toward the horizon. */
export function ripples(g, L, y0, y1, colors, seed, { n = 2500, alpha = [0.1, 0.35], len = [20, 120], wid = [1, 3], perspective = true, density } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const k = Math.pow(r(), perspective ? 1.6 : 1);        // more near the top (far)
    const y = y0 + (1 - k) * 0 + k * (y1 - y0);
    const x = r() * L.w; if (density && r() > density(x, y)) continue;
    const near = (y - y0) / Math.max(1, y1 - y0);
    g.globalAlpha = r.range(...alpha);
    stroke(g, x, y, r.range(-0.01, 0.01), r.range(...len) * (0.4 + near * 1.2), r.range(...wid) * (0.5 + near * 1.3), r.pick(colors), 0.9, r);
  }
  g.globalAlpha = 1;
}

/** Slanted rain veils hanging from y0 (cloud base) to y1, used on far layers. */
export function rainVeil(g, x, y0, y1, w, color, a, seed, slant = 0.25) {
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const u = r.gauss() * 0.3; const xx = x + u * w; const len = (y1 - y0) * r.range(0.5, 1);
    g.globalAlpha = a * r.range(0.15, 0.5) * (1 - Math.min(1, Math.abs(u) * 1.5));
    const gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, rgba(color, 0.0)); gr.addColorStop(0.2, rgba(color, 1)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.beginPath(); const ww = w * r.range(0.04, 0.12);
    g.moveTo(xx, y0); g.lineTo(xx + ww, y0); g.lineTo(xx + ww + len * slant, y0 + len); g.lineTo(xx + len * slant, y0 + len); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}

/** Copy of the canvas blurred in place (out-of-focus backgrounds). */
export function blurAll(g, L, px) {
  if (!px) return;
  const c = document.createElement("canvas"); c.width = L.w; c.height = L.h; c.getContext("2d").drawImage(g.canvas, 0, 0);
  g.save(); g.clearRect(0, 0, L.w, L.h); g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); g.restore();
}

/** Canvas-space light direction from a world direction "from" (rig key) as seen by the layer's camera. */
export function lightDir(L, from) {
  const sx = from[0] * L.R.x + from[2] * L.R.z, sy = -from[1];
  const n = Math.hypot(sx, sy) || 1; return [sx / n, sy / n];
}

/**
 * Project a world point onto a layer canvas (through the layer's mean camera). Returns [cx, cy, dist, scale] where
 * scale converts a world length at that point into canvas px (scale = plane distance ratio * ppm), or null if behind.
 */
export function proj(L, p) {
  const C = L.cam, F = L.F, R = L.R, dx = p[0] - C.x, dy = p[1] - C.y, dz = p[2] - C.z;
  const dF = dx * F.x + dz * F.z; if (dF <= 0.05) return null;
  const t = L.depth / dF;
  return [L.sx((C.x + dx * t) * R.x + (C.z + dz * t) * R.z), L.yy(C.y + dy * t), Math.hypot(dx, dy, dz), t * L.ppm];
}
/** Fill a world-space polygon (list of [x,y,z]) projected onto the layer. */
export function polyW(g, L, pts, color) {
  const q = pts.map((p) => proj(L, p)); if (q.some((v) => !v)) return false;
  g.fillStyle = color; g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); return true;
}
