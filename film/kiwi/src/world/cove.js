// COVE — Ship Cove / Meretoto, Queen Charlotte Sound at dawn (S01 wide, S02 boots close-up, S03 storm rolls in).
// Layers: sky (gradient, sun, stacked cumulus, far ranges, all mirrored in the glassy water), far hills + Motuara
// Island, the near bush headland on the left, and (S03 only) a storm sky that crossfades in.
// 3D: clearing + beach terrain (painted texture + close-up detail decal), water overlay (fresnel, shallows, lap,
// ripple glints), the Te Araroa marker post, flax / crown ferns / grass tufts / pebbles / driftwood, contact shadow.
import * as K from "./land/kit.js";
import * as P from "./land/props.js";
import { RIG_U } from "../core/cel.js";
const easeOut = (k) => 1 - (1 - k) ** 2.2;

let OPTS = {};
const SUN = [40, 4.2];                       // azimuth, elevation (deg)
const LIGHT = [0.72, -0.69];                 // canvas direction toward the light for clouds
const shoreZ = (x) => -2.7 + 0.35 * Math.sin(0.31 * x + 0.5) + 0.2 * Math.sin(0.83 * x + 1.3);
const SHORE_GLSL = "float shoreZ(float x){ return -2.7 + 0.35*sin(0.31*x+0.5) + 0.2*sin(0.83*x+1.3); }";

// ------------------------------------------------------------------------------------------------ layers
const skyLayer = {
  name: "sky", depth: 900, brush: { r: 4, paper: 0.07 }, flash: 0.4,
  get blur() { return OPTS.closeup ? 9 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(11);
    K.skyGrad(g, L, M, [[60, "#33407E"], [32, "#4C5895"], [18, "#8C83B6"], [10, "#D29DB0"], [5, "#F2B6A2"], [2, "#F8CDA3"], [0, "#FCE0B8"], [-2, "#FCE0B8"]]);
    const [sx, sy] = M.p(...SUN);
    K.glow(g, sx, sy, 60 * M.dpx, "#FFD9A8", 0.5, 0.3); K.glow(g, sx, sy, 18 * M.dpx, "#FFF0CF", 0.75, 0.2);
    // painterly sky texture: long soft horizontal strokes
    K.hstreaks(g, { x: 0, y: 0, w: L.w, h: M.el(L.w / 2, 0) }, 900, ["#5A64A0", "#7E78B0", "#B48DB0", "#E8B2A8"], 21, { len: [80, 300], width: [6, 18], alpha: [0.05, 0.14], density: (x, y) => 1 });
    // high pink stratus streaks
    for (let i = 0; i < 9; i++) {
      const az = r.range(-70, 70), el = r.range(14, 32), [x, y] = M.p(az, el);
      K.streakCloud(g, x, y, r.range(14, 30) * M.dpx, r.range(0.6, 1.4) * M.dpx, ["#E9A9B4", "#C792B4", "#F6C7B8"], 30 + i, 0.5);
    }
    // stacked cumulus in perspective, lit toward the rising sun
    K.cloudField(g, L, M, {
      n: 60, seed: 5, az: [-85, 85], D: [5500, 45000], alt: [1100, 1700], W: [1000, 3200], H: [400, 1300], tall: 0.35, sun: [sx, sy], maxW: 18,
      pal: (D, c) => {
        const f = K.clamp((D - 3500) / 26000), ns = Math.exp(-(((c.az - SUN[0]) / 28) ** 2));
        return { shadow: K.mix(K.mix("#7A6CA0", "#A88AAE", ns * 0.6), "#E3B4B0", f * 0.65), mid: K.mix(K.mix("#C497B4", "#EAA9A2", ns), "#F2C6B6", f * 0.5),
          lit: K.mix("#FFDCBD", "#FFF0D2", ns), hi: K.mix("#FFF3E2", "#FFFBEF", ns), base: K.mix("#6A6094", "#D6A6AE", f * 0.7) };
      },
      underGlow: (c) => Math.abs(c.az - SUN[0]) < 30 ? "#FFCB98" : null,
      skip: (az, eb) => Math.abs(az - SUN[0]) < 5 && eb < 7,
    });
    // the sun: a white-gold disc just clearing the far ridge
    K.glow(g, sx, sy, 10 * M.dpx, "#FFE7BD", 0.85, 0.35); K.glow(g, sx, sy, 2.2 * M.dpx, "#FFFBEE", 1, 0.6);
    g.fillStyle = "#FFFDF4"; g.beginPath(); g.arc(sx, sy, 0.55 * M.dpx, 0, Math.PI * 2); g.fill();
    // far ranges A: very hazy, warm-lavender silhouettes across the sound
    const rangeA = K.ridge(L, M, L.depth, (az) => L.depth * Math.tan((2.4 + 1.6 * K.fbm1(az / 9, 4, 41) + 1.2 * Math.max(0, Math.sin((az + 30) / 26))) * Math.PI / 180), { crown: 1.2, crownWave: 6, seed: 4 });
    K.bushHill(g, L, rangeA, { base: "#BC9CB2", shadow: "#AD90AC", mid: "#C3A0B2", lit: "#E6BAB4", rim: "#FFE2C4", haze: "#F6D0BC" }, 44, { dab: 3, n: 1200, rimA: 0.7, dabA: [0.1, 0.25], spurA: [0.08, 0.2] });
    // reflection: the whole sky in the water, a little darker and cooler further down
    const yH = L.yy(0);
    K.reflect(g, L, yH, { tint: "#59518A", tintA: 0.45, tintA0: 0.08, ripple: 5, wave: 30, seed: 7 });
    // sun glitter path + ripple light lines
    const r2 = K.rng(19);
    for (let i = 0; i < 900; i++) {
      const k = Math.pow(r2(), 1.4), y = yH + 2 + k * (L.h - yH), spread = (4 + k * 12) * M.dpx * (0.4 + r2() * 0.6);
      const x = sx + r2.gauss() * spread * 0.5;
      g.globalAlpha = r2.range(0.25, 0.7) * (1 - k * 0.7);
      K.stroke(g, x, y, 0, r2.range(8, 30) * (0.5 + k * 2), r2.range(1, 3) * (0.6 + k * 2), r2() < 0.6 ? "#FFF1D2" : "#FFD9A6", 0.9, r2);
    }
    g.globalAlpha = 1;
    K.ripples(g, L, yH + 2, L.h, ["#F9D2B2", "#E2B0B4", "#8E7AAE", "#6A5E98"], 23, { n: 2600, alpha: [0.08, 0.3], len: [20, 90], wid: [1, 2.5] });
  },
};

const farLayer = {
  name: "far", depth: 600, brush: { r: 3, paper: 0.06 }, flash: 0.4,
  get blur() { return OPTS.closeup ? 9 : 0; },
  paint(g, L) {
    const M = K.wmap(L);
    const deg = (e) => L.depth * Math.tan(e * Math.PI / 180);
    // range B: the hills across the sound (bush-clad), lit from the right
    const rb = K.ridge(L, M, L.depth, (az) => deg(1.3 + 1.2 * (K.fbm1(az / 7, 4, 51) + 0.5) + 0.9 * Math.exp(-(((az + 22) / 14) ** 2)) - 0.9 * Math.exp(-(((az - 24) / 10) ** 2))), { crown: 0.9, crownWave: 5, seed: 52 });
    K.bushHill(g, L, rb, { base: "#7E7294", shadow: "#695F88", mid: "#8B7D99", lit: "#D3A6A4", rim: "#FFD8B0", haze: "#F0C3B2" }, 53, { dab: 4, n: 3500, rimA: 0.8 });
    // Motuara Island, low against the sun
    const ri = K.ridge(L, M, L.depth, (az) => { const u = (az - 37) / 9; return Math.abs(u) > 1 ? -50 : deg(1.15 * Math.sqrt(1 - u * u) * (1 + 0.15 * K.fbm1(az / 2, 3, 61))); }, { crown: 0.6, crownWave: 4, seed: 62 });
    K.bushHill(g, L, ri, { base: "#6E6286", shadow: "#5E557C", mid: "#7A6C8E", lit: "#E3B2A2", rim: "#FFEBCB", haze: "#F3CCB2" }, 63, { dab: 3, n: 1500, rimA: 1 });
    // dawn mist over the water at the feet of the hills
    const yH = L.yy(0);
    K.band(g, L.w, yH - 0.5 * M.dpx, 1.4 * M.dpx, "#F6CDB6", 0.6);
    K.reflect(g, L, yH, { tint: "#5B4F86", tintA: 0.4, tintA0: 0.12, ripple: 5, wave: 25, seed: 9 });
    K.ripples(g, L, yH + 1, yH + 4 * M.dpx, ["#F6D2B8", "#C9A2B2"], 29, { n: 700, alpha: [0.1, 0.3], len: [20, 70], wid: [1, 2] });
  },
};

const headLayer = {
  name: "headland", depth: 200, brush: { r: 3, paper: 0.06 }, flash: 0.45,
  get blur() { return OPTS.closeup ? 9 : 0; },
  paint(g, L) {
    const M = K.wmap(L);
    const deg = (e) => L.depth * Math.tan(e * Math.PI / 180);
    // the bush headland closing the cove on the left: plunges to the water at az ~10, rises steeply to the left
    const prof = (az) => {
      const u = 10.5 - az; if (u <= 0) return -80;
      const e = (7.2 * (1 - Math.exp(-u / 9)) + 0.05 * u) * K.smooth(u / 2.5) + 0.7 * K.fbm1(az / 5, 4, 71) * K.smooth(u / 4);
      return deg(Math.max(0, e));
    };
    const rh = K.ridge(L, M, L.depth, prof, { crown: 2.2, crownWave: 6, seed: 72 });
    K.bushHill(g, L, rh, { base: "#263039", shadow: "#1D2530", mid: "#2F3A42", lit: "#455049", rim: "#FFC98E", haze: "#9C8698" }, 73, { dab: 7, n: 7000, rimA: 1, hazeH: 0.2, dabA: [0.2, 0.45], spurA: [0.2, 0.4] });
    const r = K.rng(74);
    // rocks at the waterline
    const yH = L.yy(0);
    for (let i = 0; i < 40; i++) {
      const az = r.range(-75, 9), x = M.x(az); const w = r.range(1.5, 5) * L.ppm;
      if (!(rh.top(x) < yH - 2)) continue;
      K.blob(g, x, yH - w * 0.12, w, w * 0.32, r() < 0.5 ? "#3B3A48" : "#4A4654", 80 + i, 0.3, 10);
      g.globalAlpha = 0.6; K.blob(g, x + w * 0.3, yH - w * 0.25, w * 0.45, w * 0.12, "#C9A890", 81 + i, 0.3, 8); g.globalAlpha = 1;
    }
    K.band(g, L.w, yH - 0.4 * M.dpx, 1.2 * M.dpx, "#EFC5B4", 0.35);
    K.reflect(g, L, yH, { tint: "#2E2C4E", tintA: 0.35, tintA0: 0.15, ripple: 6, wave: 22, seed: 13 });
    K.ripples(g, L, yH + 1, L.h, ["#F2CDB6", "#B596B0", "#2E3446"], 33, { n: 1600, alpha: [0.08, 0.28], len: [20, 90], wid: [1, 3], density: (x) => (M.az(x) < 9 ? 1 : 0) });
  },
};

const stormLayer = {
  name: "storm", depth: 880, brush: { r: 4, paper: 0.07 }, flash: 0.6,
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(91), yH = L.yy(0);
    // the front covers the canvas left of a ragged leading edge at ~78% width; scrolled in from the left in update()
    const edge = (y) => L.w * (0.62 + 0.07 * K.fbm1(y / 120, 4, 92)) + Math.max(0, yH - y) * 0.32 + Math.abs(K.noise1(y / 45, 95)) * L.w * 0.03;
    const front = new Path2D(); front.moveTo(-10, -10); for (let y = -10; y <= yH; y += 6) front.lineTo(edge(y), y); front.lineTo(-10, yH); front.closePath();
    g.save(); g.clip(front);
    K.skyGrad(g, L, M, [[60, "#141A2B"], [25, "#1E2539"], [10, "#2C3450"], [3, "#454A66"], [0.5, "#7A6C80"], [-1, "#6A6278"]]);
    const pal = { shadow: "#1D2336", mid: "#2B3250", lit: "#4E5574", hi: "#6E7290", base: "#151A2A" };
    for (let i = 0; i < 16; i++) {
      const az = -80 + i * 10 + r.range(-4, 4), el = r.range(3, 14), [x] = M.p(az, el);
      const yb = M.el(x, el), yt = M.el(x, el + r.range(5, 12));
      K.cumulus(g, x, (yb + yt) / 2, r.range(16, 26) * M.dpx, yb - yt, pal, 100 + i, [0.55, -0.83], { towers: 2, litW: 0.06, midW: 0.18 });
    }
    K.hstreaks(g, { x: 0, y: 0, w: L.w, h: M.el(L.w / 2, 4) }, 1600, ["#232A42", "#30385A", "#1A2034", "#3C4466"], 93, { len: [60, 260], width: [6, 20], alpha: [0.2, 0.5] });
    for (let i = 0; i < 7; i++) { const [x] = M.p(r.range(-60, 40), 3); K.rainVeil(g, x, M.el(x, 7), M.el(x, -0.1), r.range(5, 10) * M.dpx, "#262C44", 0.7, 94 + i, 0.2); }
    g.restore();
    // billows along the leading edge, catching the last warm light
    for (let y = 10; y < yH - 10; y += r.range(30, 70)) { const x = edge(y), s2 = r.range(30, 70) * (1 - y / yH * 0.5);
      K.cumulus(g, x - s2 * 0.4, y, s2 * 2.2, s2 * 1.3, { shadow: "#262C44", mid: "#3C4262", lit: "#8E7C92", hi: "#C9A2A2", base: "#1E2336" }, 300 + y, [0.85, -0.5], { towers: 1, buds: 3 }); }
    K.reflect(g, L, yH, { tint: "#0E1220", tintA: 0.5, tintA0: 0.15, ripple: 7, wave: 25, seed: 15 });
    K.ripples(g, L, yH + 1, L.h, ["#5E6684", "#2A3048"], 35, { n: 1400, alpha: [0.1, 0.3], len: [20, 90], wid: [1, 3], density: (x, y) => (x < edge(2 * yH - y) ? 1 : 0) });
  },
};

const BASE = [skyLayer, farLayer, headLayer];

// ------------------------------------------------------------------------------------------------ ground
const X0 = -30, X1 = 34, Z0 = -5.5, Z1 = 16, IX0 = -8, IX1 = 12, IZ0 = -4.5, IZ1 = 9;   // inner (detailed) texture area
const warp = (v, a0, a1, b0, b1, A0, A1) => v < a0 ? (v - A0) / (a0 - A0) * b0 : v > a1 ? b1 + (v - a1) / (A1 - a1) * (1 - b1) : b0 + (v - a0) / (a1 - a0) * (b1 - b0);
const UX = (x) => warp(x, IX0, IX1, 0.05, 0.95, X0, X1), UZ = (z) => warp(z, IZ0, IZ1, 0.06, 0.94, Z0, Z1);
const pathZ = (x) => 0.02 + 0.18 * Math.sin(x * 0.32 + 0.4) - 0.04 * x * (x < 0 ? 0.3 : 0.1);
function groundH(x, z) {
  const d = z - shoreZ(x);                                       // metres inland of the waterline
  let y;
  if (d < 0) y = -0.15 * K.smooth(-d / 0.4);
  else y = 0.06 * K.smooth(d / 1.4) + Math.min(0.2, Math.max(0, d - 1.4) * 0.02);
  y += 0.035 * K.fbm2(x * 0.35, z * 0.35, 4, 7) * K.smooth((d - 0.5) / 2);
  y += Math.max(0, z - 4) * 0.05 + Math.max(0, -x - 7) * 0.03 + Math.max(0, x - 9) * 0.04;
  // the kiwi's spot and the track are flat at 0
  const rk = Math.hypot(x - 0.25, z + 0.05); const flat = 1 - K.smooth((rk - 1.0) / 1.0);
  const trk = (1 - K.smooth((Math.abs(z - pathZ(x)) - 0.3) / 0.5)) * (d > 1.6 ? 1 : 0);
  return K.lerp(y, 0, Math.max(flat, trk * 0.85));
}

/** Painted long shadow over the foreground (bush behind the right of camera); 0 = lit, 1 = shade. */
const shadeK = (x, z) => K.smooth((z - (2.2 + 1.1 * K.fbm1(x * 0.22, 3, 17) + Math.max(0, x - 4) * 0.12)) / 1.4) * 0.85;
function paintGround(g, w, h, detail) {
  // world <-> texture
  const tx = detail ? (x) => (x - detail.x0) / (detail.x1 - detail.x0) * w : (x) => UX(x) * w;
  const tz = detail ? (z) => (1 - (z - detail.z0) / (detail.z1 - detail.z0)) * h : (z) => (1 - UZ(z)) * h;
  const area = detail ?? { x0: IX0, x1: IX1, z0: IZ0, z1: IZ1 };
  const ppmx = tx(area.x0 + 1) - tx(area.x0);                     // px per metre (inner)
  const r = K.rng(detail ? 202 : 201);
  // grass base
  g.fillStyle = "#5E7040"; g.fillRect(0, 0, w, h);
  const big = (x, z) => K.fbm2(x * 0.4, z * 0.4, 4, 3);
  // patches of colour (world-anchored so detail and coarse textures agree)
  const pat = (n, cols, sz, alpha, seed, region) => {
    const rr = K.rng(seed);
    for (let i = 0; i < n; i++) {
      const x = K.lerp(region.x0, region.x1, rr()), z = K.lerp(region.z0, region.z1, rr());
      const b = big(x, z); const c = cols[Math.min(cols.length - 1, Math.floor((b * 0.5 + 0.5) * cols.length + rr.range(-0.6, 0.6)) | 0)] ?? cols[0];
      g.globalAlpha = rr.range(...alpha);
      const s = sz * rr.range(0.5, 1.5);
      K.stroke(g, tx(x), tz(z), rr.range(-0.25, 0.25), s * ppmx * 4, s * ppmx * 0.8, c, 0.8, rr);
    }
    g.globalAlpha = 1;
  };
  const full = detail ?? { x0: X0, x1: X1, z0: Z0, z1: Z1 };
  pat(detail ? 9000 : 16000, ["#4A5E34", "#56693A", "#667A42", "#7E8A4C", "#94965A"], detail ? 0.05 : 0.12, [0.3, 0.7], 3, full);
  // grass blade flecks
  pat(detail ? 26000 : 30000, ["#3C4E2A", "#728448", "#A0A060", "#B5AE6E"], detail ? 0.012 : 0.04, [0.3, 0.8], 4, full);
  // beach: polygon from the shore curve
  const beach = new Path2D(); const bw = (x) => 1.1 + 0.4 * K.noise1(x * 0.3, 5);
  beach.moveTo(tx(full.x0 - 1), tz(full.z0 - 1));
  for (let x = full.x0 - 1; x <= full.x1 + 1; x += 0.1) beach.lineTo(tx(x), tz(shoreZ(x) + bw(x)));
  beach.lineTo(tx(full.x1 + 1), tz(full.z0 - 1)); beach.closePath();
  g.save(); g.clip(beach);
  g.fillStyle = "#9C8E7C"; g.fillRect(0, 0, w, h);
  pat(detail ? 7000 : 9000, ["#857868", "#A49684", "#B8AA96", "#8E8476"], detail ? 0.03 : 0.07, [0.4, 0.8], 5, full);
  // wet band near the water
  for (let x = full.x0; x <= full.x1; x += detail ? 0.01 : 0.05) {
    const z = shoreZ(x); g.globalAlpha = 0.55; g.fillStyle = "#5E5A5A";
    g.fillRect(tx(x), tz(z + 0.35), Math.max(1, (detail ? 0.012 : 0.06) * ppmx), Math.abs(tz(z + 0.35) - tz(z - 0.4)));
  }
  g.globalAlpha = 1;
  g.restore();
  // grass edge tufts spilling onto the beach
  pat(detail ? 2500 : 3000, ["#5A6C3A", "#7A8448"], detail ? 0.03 : 0.06, [0.4, 0.8], 6, full);
  // the track: worn dirt with grass in the middle
  const trackP = new Path2D(); const tw = (x) => 0.26 + 0.05 * K.noise1(x * 0.8, 8);
  trackP.moveTo(tx(full.x0), tz(pathZ(full.x0) + tw(full.x0)));
  for (let x = full.x0; x <= full.x1; x += 0.05) trackP.lineTo(tx(x), tz(pathZ(x) + tw(x)));
  for (let x = full.x1; x >= full.x0; x -= 0.05) trackP.lineTo(tx(x), tz(pathZ(x) - tw(x)));
  trackP.closePath();
  g.save(); g.clip(trackP);
  g.fillStyle = "#8A7258"; g.fillRect(0, 0, w, h);
  pat(detail ? 9000 : 6000, ["#7A644E", "#957C60", "#A89070", "#6A5644"], detail ? 0.02 : 0.05, [0.4, 0.85], 7, full);
  // gravel specks
  const rg = K.rng(8);
  for (let i = 0; i < (detail ? 30000 : 12000); i++) {
    const x = K.lerp(full.x0, full.x1, rg()), z = pathZ(x) + rg.range(-0.3, 0.3); const s = rg.range(0.004, detail ? 0.014 : 0.02) * ppmx;
    g.fillStyle = rg.pick(["#B9AE9A", "#9A8E7C", "#6E6254", "#CFC4AE"]); g.globalAlpha = rg.range(0.5, 1);
    g.beginPath(); g.ellipse(tx(x), tz(z), s, s * 0.7, rg() * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // middle grass strip
  pat(detail ? 1500 : 800, ["#5A6C3A", "#6E7E44"], detail ? 0.025 : 0.05, [0.2, 0.5], 9, { ...full, z0: -0.05, z1: 0.05 });
  g.restore();
  // soft edge between track and grass
  g.globalAlpha = 0.5; g.strokeStyle = "#5A4A3A"; g.lineWidth = Math.max(1, 0.02 * ppmx); g.stroke(trackP); g.globalAlpha = 1;
  // long shadow over the foreground: soft-edged cool glaze + broken edge strokes
  for (let k = 0; k < 8; k++) {
    const sp = new Path2D(); sp.moveTo(tx(full.x0 - 1), tz(full.z1 + 1));
    for (let x = full.x0 - 1; x <= full.x1 + 1; x += detail ? 0.02 : 0.1) { let lo = full.z0 - 1; for (let z = full.z1; z > full.z0 - 1; z -= 0.25) if (shadeK(x, z) < 0.06 + k * 0.1) { lo = z; break; } sp.lineTo(tx(x), tz(lo)); }
    sp.lineTo(tx(full.x1 + 1), tz(full.z1 + 1)); sp.closePath();
    g.globalAlpha = 0.07; g.fillStyle = k < 4 ? "#3A4256" : "#2E3646"; g.fill(sp);
  }
  const rs = K.rng(12);
  for (let i = 0; i < (detail ? 3000 : 9000); i++) {
    const x = K.lerp(full.x0, full.x1, rs()), z = K.lerp(full.z0, full.z1, rs()); const k = shadeK(x, z); if (k < 0.1 || k > 0.7) continue;
    g.globalAlpha = rs.range(0.15, 0.3);
    K.stroke(g, tx(x), tz(z), rs.range(-0.15, 0.15), (detail ? 0.1 : 0.45) * ppmx, (detail ? 0.025 : 0.1) * ppmx, "#343C50", 0.8, rs);
  }
  g.globalAlpha = 1;
  if (detail) {
    // alpha falloff at the decal border so it melts into the coarse ground
    g.globalCompositeOperation = "destination-in";
    const m = 0.12 * w;
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, "rgba(0,0,0,0)"); gx.addColorStop(m / w, "rgba(0,0,0,1)"); gx.addColorStop(1 - m / w, "rgba(0,0,0,1)"); gx.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gx; g.fillRect(0, 0, w, h);
    const gz = g.createLinearGradient(0, 0, 0, h); gz.addColorStop(0, "rgba(0,0,0,0)"); gz.addColorStop(m / h, "rgba(0,0,0,1)"); gz.addColorStop(1 - m / h, "rgba(0,0,0,1)"); gz.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gz; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  }
}

// ------------------------------------------------------------------------------------------------ water overlay
function waterMesh(ctx) {
  const { THREE } = ctx;
  const U = RIG_U;                                 // shared rig uniforms (flash)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDark: { value: 0 }, uFlash: U.uFlash, uFlashColor: U.uFlashColor,
      uDeep: { value: new THREE.Color("#3E3F6A") }, uShallow: { value: new THREE.Color("#77708A") }, uGlint: { value: new THREE.Color("#FFE6C4") }, uFoam: { value: new THREE.Color("#F3E6DA") } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDark; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGlint; uniform vec3 uFoam;
      uniform float uFlash; uniform vec3 uFlashColor; varying vec3 vW;
      ${SHORE_GLSL}
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 V = cameraPosition - vW; float dist = length(V); vec3 v = V / dist;
        float d = shoreZ(vW.x) - vW.z;                      // metres out from the waterline
        if (d < 0.0) discard;
        float fres = smoothstep(0.03, 0.5, v.y);
        vec3 col = uDeep; float a = fres * 0.6;
        float sh = 1.0 - smoothstep(0.45, 1.4, d);
        col = mix(col, uShallow, sh); a = max(a, sh * 0.78);
        // lapping line (slow breathing of the glassy water)
        float lap = 0.05 + 0.035 * sin(uTime * 1.1 + vW.x * 1.7) + 0.02 * sin(uTime * 0.7 - vW.x * 3.1);
        float foam = smoothstep(lap + 0.04, lap, d) * (0.6 + 0.4 * vn(vec2(vW.x * 9.0, uTime)));
        col = mix(col, uFoam, foam); a = max(a, foam * 0.9);
        // a second faint line just outside
        float l2 = smoothstep(0.03, 0.0, abs(d - lap - 0.22 - 0.05 * sin(uTime * 0.9 + vW.x))) * 0.5;
        col = mix(col, uFoam, l2 * 0.6); a = max(a, l2 * 0.4);
        // ripple glints: thin horizontal streaks drifting slowly
        float n = vn(vec2(vW.x * 0.35 + uTime * 0.03, vW.z * 2.6 + uTime * 0.12)) * 0.65 + vn(vec2(vW.x * 1.3, vW.z * 7.0 - uTime * 0.2)) * 0.35;
        float fade = 1.0 - smoothstep(18.0, 60.0, dist);
        float glint = smoothstep(0.66, 0.74, n) * fade * smoothstep(0.2, 1.0, d);
        col = mix(col, uGlint, glint); a = max(a, glint * 0.55);
        float dk = smoothstep(0.30, 0.22, n) * fade * 0.35 * smoothstep(0.2, 1.0, d);
        a = max(a, dk); col = mix(col, uDeep * 0.7, dk);
        col *= 1.0 - uDark * 0.55;
        col = mix(col, uFlashColor, uFlash * 0.8);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 420, 1, 1).rotateX(-Math.PI / 2), mat);
  m.position.set(0, 0, -205); m.renderOrder = 1; m.name = "water"; m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------------------------------------ build
export default {
  get layers() { return OPTS.darken ? [...BASE, stormLayer] : BASE; },
  build(ctx) {
    OPTS = ctx.opts ?? {};
    const { THREE, inkable } = ctx;
    const group = new THREE.Group(); group.name = "cove";
    const closeup = !!OPTS.closeup;
    // ground
    const tex = ctx.paintTexture(4096, 2048, (g, w, h) => paintGround(g, w, h, null), { r: 2, paper: 0.05 });
    tex.anisotropy = 8;
    const gmat = ctx.celMaterial({ map: tex, thresh: -0.3, rim: 0, shade: 0.6 });
    const T = P.terrain(ctx, { x0: X0, x1: X1, z0: Z0, z1: Z1, nx: 256, nz: 86, h: groundH, material: gmat, uv: (x, z) => [UX(x), UZ(z)],
      keep: (a, b, c, d) => Math.max(a, b, c, d) > -0.1 });
    group.add(T.mesh, P.inkOccluder(ctx, T.mesh, (a, b, c) => Math.min(a, b, c) > -0.012));
    const heightAt = T.heightAt;
    // close-up detail decal around the kiwi (same vertices as the terrain -> no z-fight beyond polygonOffset)
    const DD = closeup ? { x0: -1.5, x1: 1.0, z0: -1.5, z1: 1.0 } : { x0: -2.5, x1: 1.5, z0: -2.5, z1: 1.5 };
    const dtex = ctx.paintTexture(2048, 2048, (g, w, h) => paintGround(g, w, h, DD), { r: closeup ? 1 : 2, paper: 0.03 });
    const dmat = ctx.celMaterial({ map: dtex, thresh: -0.3, rim: 0, shade: 0.6, transparent: true });
    dmat.polygonOffset = true; dmat.polygonOffsetFactor = -1; dmat.polygonOffsetUnits = -2; dmat.depthWrite = false;
    const dec = P.terrain(ctx, { x0: DD.x0, x1: DD.x1, z0: DD.z0, z1: DD.z1, nx: closeup ? 10 : 16, nz: closeup ? 10 : 16, h: (x, z) => heightAt(x, z), material: dmat });
    dec.mesh.name = "ground-detail"; dec.mesh.renderOrder = 0; group.add(dec.mesh);
    // water
    const water = waterMesh(ctx); group.add(water);
    // marker post
    const [mx, mz] = OPTS.marker ?? [0.48, -0.28];
    const post = P.markerPost(ctx, mx, mz, { y: heightAt(mx, mz) - 0.02, yaw: -22, h: 1.1 });
    group.add(post.group);
    // vegetation
    const flaxA = P.flax(ctx, { x: -3.05, z: 3.55, y: heightAt(-3.05, 3.55), seed: 3, n: 20, len: [0.9, 1.7] });
    const flaxB = P.flax(ctx, { x: 5.6, z: -1.3, y: heightAt(5.6, -1.3), seed: 5, n: 16, len: [0.8, 1.4] });
    const flaxC = P.flax(ctx, { x: -4.6, z: -1.0, y: heightAt(-4.6, -1.0), seed: 7, n: 16, len: [0.8, 1.5] });
    const fernA = P.fern(ctx, { x: -0.45, z: 3.7, y: heightAt(-0.45, 3.7), seed: 9, n: 13, len: [0.5, 0.85] });
    const fernB = P.fern(ctx, { x: -1.7, z: -1.6, y: heightAt(-1.7, -1.6), seed: 10, n: 10, len: [0.35, 0.55] });
    const fernC = P.fern(ctx, { x: 2.4, z: 1.8, y: heightAt(2.4, 1.8), seed: 12, n: 11, len: [0.4, 0.6] });
    for (const v of [flaxA, flaxB, flaxC]) { inkable(v); group.add(v); }
    for (const v of [fernA, fernB, fernC]) group.add(v);
    // grass tufts: keep the kiwi's spot, his walk (x 0..1.2 at z~0) and the track clear
    const onTrack = (x, z) => Math.abs(z - pathZ(x)) < 0.28;
    const clumps = P.scatter(260, 30, (r) => ({ x: r.range(-9, 13), z: r.range(-2.4, 8.5), k: r.range(0.3, 1) }));
    const tufts = P.scatter(2400, 31, (r) => {
      const c = r.pick(clumps), near = r() < 0.3;
      const x = near ? r.range(-2.5, 3) : c.x + r.gauss() * 0.45 * c.k, z = near ? r.range(-2, 2.6) : c.z + r.gauss() * 0.3 * c.k;
      if (z - shoreZ(x) < 1.1 + r() * 0.5) return null; if (onTrack(x, z)) return null;
      if (Math.hypot(x - 0.1, z) < 0.32 || (x > -0.3 && x < 1.4 && Math.abs(z) < 0.26)) return null;
      if (Math.hypot(x - mx, z - mz) < 0.08) return null;
      const s = r.range(0.035, 0.09) * (near ? 0.8 : 1.2) * (0.7 + c.k * 0.5), sk = shadeK(x, z);
      return { x, z, s, sy: s * r.range(0.7, 1.2), yaw: r.range(0, 6.28), c: [1 - 0.55 * sk, 1 - 0.5 * sk, 1 - 0.35 * sk] };
    });
    const tg = P.tuftGeo(ctx, { blades: 14, seed: 3, base: "#56683A", tip: "#CFC487", width: 0.09, lean: 0.8 });
    const tuftMesh = P.instanced(ctx, tg, tufts, { heightAt, name: "tufts", sink: 0.05, thresh: -0.5, rim: 0.6 });
    group.add(tuftMesh);
    // close-up grass blades + gravel around the boots
    const fine = P.scatter(closeup ? 900 : 300, 33, (r) => {
      const x = r.range(-1.6, 1.2), z = r.range(-1.8, 0.6);
      if (onTrack(x, z) && r() < 0.85) return null; if (Math.hypot(x - 0.1, z) < 0.22) return null;
      if (x > -0.3 && x < 1.4 && Math.abs(z) < 0.2) return null;
      if (z - shoreZ(x) < 1.2) return null;
      const s = r.range(0.025, 0.055); return { x, z, s, sy: s * r.range(0.9, 1.6), yaw: r.range(0, 6.28) };
    });
    const fg = P.tuftGeo(ctx, { blades: 9, seed: 5, base: "#5A6C3A", tip: "#D2C68A", width: 0.06, lean: 0.9 });
    group.add(P.instanced(ctx, fg, fine, { heightAt, name: "grass-fine", sink: 0.02, thresh: -0.5, rim: 0.7 }));
    const rg = P.rockGeo(ctx, { seed: 2, detail: 0, flat: 0.55 });
    const pebPts = P.scatter(closeup ? 650 : 450, 35, (r) => {
      const onBeach = r() < (closeup ? 0.2 : 0.4); const x = onBeach ? r.range(-6, 8) : closeup ? r.range(-1.2, 0.9) : r.range(-1.8, 1.6);
      const z = onBeach ? shoreZ(x) + r.range(-0.1, 1.0) : pathZ(x) + r.range(-0.32, 0.32);
      if (Math.hypot(x - 0.1, z) < 0.16) return null;
      const s = onBeach ? r.range(0.01, 0.05) : r.range(0.003, 0.01);
      return { x, z, s: [s * r.range(0.8, 1.3), s * r.range(0.5, 0.9), s], yaw: r.range(0, 6.28), y: heightAt(x, z) };
    });
    const pebbles = P.instanced(ctx, P.rockGeo(ctx, { seed: 2, detail: 0, flat: 0.8 }), pebPts, { name: "pebbles", color: "#B4A894", thresh: 0.0, rim: 0.4, side: THREE.FrontSide });
    if (closeup) inkable(pebbles);
    group.add(pebbles);
    // beach stones and a driftwood log (inkable, solid)
    const stones = [], colliders = [T.mesh, ...post.colliders];
    const sr = K.rng(41);
    for (let i = 0; i < 9; i++) {
      const x = sr.range(-5.5, 7.5), z = shoreZ(x) + sr.range(0.05, 0.7); if (Math.abs(x) < 1.6) continue;
      const s = sr.range(0.06, 0.16);
      const m = new THREE.Mesh(P.rockGeo(ctx, { seed: 50 + i, detail: 1, flat: 0.6 }), ctx.celMaterial({ color: sr.pick(["#7E7684", "#8E8478", "#6E6A74"]), rim: 0.8 }));
      m.position.set(x, heightAt(x, z) - s * 0.15, z); m.scale.set(s * 1.3, s, s); m.rotation.y = sr.range(0, 6); m.name = "stone"; m.userData.closed = true;
      inkable(m); group.add(m); stones.push(m); colliders.push(m);
    }
    // contact shadow under the kiwi
    const cs = P.contactShadow(ctx, { size: [0.5, 0.42], a: 0.38, color: "#2A1E30" }); group.add(cs.mesh);

    const tintOf = (name, k, toward) => { const l = ctx.layers?.find((x) => x.name === name); if (l) l.mesh.material.uniforms.uTint.value.setRGB(...toward.map((c) => 1 - (1 - c) * k)); };
    group.updateMatrixWorld(true);   // nested props (marker post, signpost) must have world matrices before any render
    return {
      group, heightAt, colliders,
      update(t, t2, c) {
        water.material.uniforms.uTime.value = t;
        cs.update(c, heightAt);
        post.setLit(0, c.camera);
        if (OPTS.darken) {
          const [d0, d1] = OPTS.darken; const k = K.smooth((t - d0) / (d1 - d0));
          const storm = c.layers?.find((x) => x.name === "storm");
          if (storm) { const u = storm.mesh.material.uniforms; u.uOpacity.value = K.smooth((t - d0) / (d1 - d0) * 1.6); u.uScroll.value.set(0.45 * (1 - easeOut(k)), 0); }
          tintOf("far", k, [0.42, 0.45, 0.6]); tintOf("headland", k, [0.38, 0.42, 0.55]);
          water.material.uniforms.uDark.value = k;
          gmat.uniforms.uColor.value.setRGB(1 - 0.35 * k, 1 - 0.32 * k, 1 - 0.22 * k);
          dmat.uniforms.uColor.value.copy(gmat.uniforms.uColor.value);
        }
      },
      dispose() {},
    };
  },
};
