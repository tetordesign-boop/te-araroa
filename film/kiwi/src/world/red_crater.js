// S09 / S10d — Tongariro's Red Crater in a gale. Low hero camera (10 cm) on a red scoria crest along X; behind it the
// ground drops into the crater. Layers: gale sky (torn streaks, a lenticular over Ngauruhoe), the far cone and
// plateau, the Emerald Lakes basin, the layered ochre/maroon crater wall with steam vents.
import * as THREE from "three";
import { rng, smooth, clamp } from "../core/time.js";
import { stroke, blob } from "../core/paint.js";
import { makeNoise, frame, paintSky, paintRange, rangeProfile, stratus, silhouetteFill, shade, mix, rgba, smoothstep } from "./sky/kit.js";
import { gridTerrain, axis, tileTexture, mergedRocks, scatter } from "./sky/terrain.js";

const N = makeNoise(77);
const SUN_AZ = 71;
const lightAt = (F, lz = -0.15) => (px) => [clamp((SUN_AZ - F.azAt(px)) / 20, -1, 1) * 0.85, 0.35, lz];
const NGAU = (az) => { const d = Math.abs(az + 24), k = Math.max(0, 1 - d / 12.5); return k > 0.04 ? 0.6 + Math.min(8.6, 9.4 * Math.pow(k, 1.05)) + 0.12 * N.n(az * 2, 1) : -10; };
const PLATEAU = rangeProfile({ base: 0.5, amp: 0.5, wave: 9, seed: 3, sharp: 0.3, jag: 0.05, peaks: [{ az: 26, el: 2.8, w: 22, pow: 1.8 }] });
const BASIN = (az) => -0.9 + 0.7 * N.fbm(az / 5, 1.3, 3) + 0.35 * N.ridged(az / 2, 4.1, 3) + 2.2 * smoothstep(-16, -60, az) * (0.8 + 0.2 * Math.sin(az * 0.3));
const RIMP = rangeProfile({ base: 1.5, amp: 0.9, wave: 5, seed: 9, sharp: 0.7, jag: 0.2, peaks: [{ az: -68, el: 15, wl: 30, wr: 34, pow: 1.15 }, { az: 46, el: 8.5, w: 14 }] });
// the crater wall rises to the far left; a saddle frames Ngauruhoe; to the right the crest falls away to the lakes
const RIM = (az) => RIMP(az) - 6.8 * smoothstep(-19, -3, az) * smoothstep(40, 26, az);
const SKY = [[-8, "#E7A07F"], [0, "#EEA887"], [4, "#E39A84"], [10, "#C88087"], [18, "#966586"], [28, "#634A7A"], [42, "#3E3267"], [65, "#2B2350"]];

export default {
  layers: [
    {
      name: "sky", depth: 3200, quality: 0.75, brush: { r: 3, paper: 0.05 }, flash: 0.2,
      paint(g, L) {
        const F = frame(L), r = rng(41);
        paintSky(g, L, F, { stops: SKY, seed: 6, angle: -0.03, glows: [{ az: SUN_AZ, el: 12, r: 55, color: "#FFC9A0", a: 0.55 }] });
        // wind-torn streaks racing left, lit on their right/lower edges by the low sun
        for (let i = 0; i < 70; i++) {
          const az = r.range(-110, 70), el = r.range(4, 60), [x, y] = F.at(az, el), w = r.range(8, 30) * F.ppd * (1 - el / 120), h = r.range(0.5, 1.6) * F.ppd;
          const warm = smoothstep(-60, 60, az) * smoothstep(50, 5, el);
          stratus(g, x, y, w, h, { shadow: mix("#5E4A7C", "#B0738A", warm), mid: mix("#8A6A94", "#E39A8E", warm), light: mix("#C79AB0", "#FFD0AE", warm) }, 70 + i, { light: [0.85, 0.5], n: 12, tear: 0.9, angle: -0.04 + r.gauss() * 0.03 });
        }
        // lenticular cap over Ngauruhoe: a stack of smooth lenses, lit on the right
        const [lx, ly] = F.at(-24, 13.2);
        for (let k = 0; k < 4; k++) {
          const cx = lx + (k - 1.5) * 0.3 * F.ppd, cy = ly - k * 0.55 * F.ppd, w = (6.5 - k * 1.1) * F.ppd, hh = 0.38 * F.ppd;
          const lens = (dx, dy, sw, sh, col, a) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.moveTo(cx - sw + dx, cy + dy); g.quadraticCurveTo(cx + dx, cy - sh * 2 + dy, cx + sw + dx, cy + dy); g.quadraticCurveTo(cx + dx, cy + sh * 1.4 + dy, cx - sw + dx, cy + dy); g.fill(); };
          lens(0, 0, w, hh, "#8A6890", 0.85); lens(w * 0.12, -hh * 0.25, w * 0.85, hh * 0.7, "#D79CA2", 0.85); lens(w * 0.35, -hh * 0.5, w * 0.5, hh * 0.35, "#FFD8BC", 0.9);
        }
        g.globalAlpha = 1;
      },
    },
    {
      name: "far", depth: 2600, quality: 0.6, brush: { r: 3, paper: 0.06 }, flash: 0.3,
      paint(g, L) {
        const F = frame(L);
        const hz = (px) => F.rowAt(px, PLATEAU(F.azAt(px)));
        paintRange(g, L, { top: hz, bottom: L.h, pal: { lit: "#C98A88", mid: "#A87484", shade: "#8A6180", deep: "#7A5679", haze: "#C98E88", snowLit: "#F6D6C6", snowShade: "#B596B0", rim: "#FFD8BC" }, lightAt: lightAt(F), seed: 5, scale: 8 * F.ppd, rimW: 1.5, thresh: [0.2, 0.5],
          snow: (px, py) => (py < F.rowAt(px, 1.9 + 0.4 * N.n(px / 60, 2)) ? 1 : 0), haze: () => 0.35 });
        const top = (px) => F.rowAt(px, NGAU(F.azAt(px)));
        paintRange(g, L, {
          top, bottom: F.rowAt(L.w / 2, -1), pal: { lit: "#B8644E", mid: "#7E4450", shade: "#56324A", deep: "#462942", haze: "#A86A70", rim: "#FFC8A0" },
          lightAt: lightAt(F), seed: 17, scale: 3.5 * F.ppd, f: 2, strokes: 1.2, rimW: 2, thresh: [0.15, 0.55], ribs: 1.4,
          haze: (px, py) => 0.12 + 0.35 * smoothstep(top(px) + 4 * F.ppd, top(px) + 10 * F.ppd, py),
        });
      },
    },
    {
      name: "basin", depth: 700, quality: 0.7, brush: { r: 3, paper: 0.06 }, flash: 0.35,
      paint(g, L) {
        const F = frame(L), r = rng(5);
        const top = (px) => F.rowAt(px, BASIN(F.azAt(px)));
        paintRange(g, L, { top, bottom: L.h, pal: { lit: "#A2604C", mid: "#7E4A48", shade: "#5E3844", deep: "#4C2E3C", haze: "#B07870", rim: "#FFC09A" }, lightAt: lightAt(F), seed: 23, scale: 5 * F.ppd, f: 3, rimW: 1.5, thresh: [0.2, 0.55],
          haze: (px, py) => 0.3 * smoothstep(top(px) + 3 * F.ppd, top(px), py) });
        // the Emerald Lakes: three flattened pools with pale sulphur rims, sky-lit cyan toward their far edge
        for (const [az, el, w, h, sd] of [[4, -1.6, 7, 0.9, 1], [17, -1.1, 5, 0.6, 2], [-8, -2.4, 4.5, 0.7, 3], [30, -0.8, 3.5, 0.4, 4]]) {
          const [x, y] = F.at(az, el), W = w * F.ppd, H = h * F.ppd;
          blob(g, x, y, W * 1.08, H * 1.25, "#D9C79A", sd * 7, 0.2, 26);
          blob(g, x, y + H * 0.05, W, H, "#1F8F7C", sd * 7 + 1, 0.18, 26);
          const gr = g.createLinearGradient(0, y - H, 0, y + H); gr.addColorStop(0, "#5CD6E6"); gr.addColorStop(0.5, "#2FBF9B"); gr.addColorStop(1, "#1C7E70");
          g.save(); g.beginPath(); g.ellipse(x, y + H * 0.05, W * 0.92, H * 0.85, 0, 0, Math.PI * 2); g.clip(); g.fillStyle = gr; g.fillRect(x - W, y - H, 2 * W, 2 * H);
          for (let i = 0; i < 30; i++) { g.globalAlpha = r.range(0.2, 0.5); stroke(g, x + r.range(-W, W) * 0.8, y + r.range(-H, H) * 0.6, 0, r.range(0.1, 0.4) * W, r.range(0.04, 0.1) * H, r() < 0.5 ? "#8DEBE8" : "#178070", 0.9, r); }
          g.restore(); g.globalAlpha = 1;
        }
      },
    },
    {
      name: "rim", depth: 240, quality: 0.75, brush: { r: 3, paper: 0.07 }, flash: 0.4,
      paint(g, L) {
        const F = frame(L), r = rng(9);
        const top = (px) => F.rowAt(px, RIM(F.azAt(px)));
        const pal = { lit: "#C4643C", mid: "#923C32", shade: "#5E2632", deep: "#401A28", haze: "#B5706A", rim: "#FFC49A" };
        const res = paintRange(g, L, { top, bottom: L.h, pal, lightAt: lightAt(F), seed: 31, scale: 4 * F.ppd, f: 2, strokes: 1.3, rimW: 2.5, thresh: [0.18, 0.55], ribs: 1.2,
          haze: (px, py) => 0.08 + 0.25 * smoothstep(top(px) + 14 * F.ppd, top(px) + 30 * F.ppd, py) });
        if (!res) return;
        // volcanic strata: dipping bands of ochre, maroon and black following the crest, plus the dark dike
        g.save(); g.clip(res.path);
        for (let b = 0; b < 46; b++) {
          const off = r.range(0.5, 26) * F.ppd, col = r.pick(["#C88A42", "#6E2430", "#2C1A20", "#B5703A", "#8A2E2C", "#D9A050"]), wid = r.range(0.15, 0.7) * F.ppd;
          g.strokeStyle = rgba(col, r.range(0.25, 0.55)); g.lineWidth = wid; g.beginPath();
          for (let x = 0; x <= L.w; x += 8) { const y = top(x) * 0.55 + (top(x) + off) * 0.45 + off * 0.55 + 0.6 * F.ppd * N.n(x / (6 * F.ppd), b); x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        const [dx, dy] = F.at(-52, RIM(-52));
        for (let i = 0; i < 70; i++) { const k = i / 70, w = (0.55 - 0.35 * k) * F.ppd * (0.7 + 0.3 * Math.sin(k * 9)); const x = dx + N.n(k * 3, 4) * 0.8 * F.ppd + k * 1.5 * F.ppd, y = dy + k * 11 * F.ppd;
          g.globalAlpha = 0.8 * (1 - k * 0.5); blob(g, x, y, w, 0.5 * F.ppd, "#2A161E", i + 3, 0.3, 10); g.globalAlpha = 0.5 * (1 - k); blob(g, x + w * 0.9, y, w * 0.3, 0.4 * F.ppd, "#E08A5A", i + 300, 0.3, 8); }
        g.globalAlpha = 1; g.restore();
        // steam vents: plumes torn to the left by the gale
        for (const [az, el, sz, sd] of [[-34, 3.5, 1.0, 1], [-6, 1.2, 0.8, 2], [12, 1.4, 1.2, 3], [-70, 9, 0.7, 4]]) {
          const [x, y] = F.at(az, el), u = F.ppd * sz;
          for (let i = 0; i < 40; i++) {
            const k = i / 40, px = x - k * k * 18 * u - k * 2 * u, py = y - k * 5 * u + k * k * 2.5 * u, s = u * (0.6 + k * 2.4);
            g.globalAlpha = (1 - k) * 0.55; blob(g, px, py, s, s * 0.6, k < 0.3 ? "#F8E6DC" : "#E8C2BE", sd * 100 + i, 0.35, 14);
            g.globalAlpha = (1 - k) * 0.4; blob(g, px + s * 0.25, py - s * 0.2, s * 0.6, s * 0.35, "#FFE2C8", sd * 100 + i + 50, 0.35, 12);
          }
        }
        g.globalAlpha = 1;
      },
    },
  ],
  build(ctx) {
    const { celMaterial, inkable } = ctx;
    const group = new THREE.Group();
    const h = (x, z) => {
      const back = z < -0.25 ? -(0.9 * (-z - 0.25) ** 2 + 0.5 * (-z - 0.25)) : 0;
      const front = z > 0 ? -0.025 * z : 0;
      const away = smooth((Math.abs(z) - 0.25) / 1.5);
      return back + front + 0.012 * N.fbm(x * 2.6, z * 2.6, 3) + 0.004 * N.n(x * 13, z * 13) + 0.15 * away * N.fbm(x * 0.3, z * 0.3, 2) + 0.12 * smooth((-x - 3) / 6);
    };
    const tex = tileTexture(ctx, 1024, 1024, (g, w, hh, wrap) => {
      const r = rng(12);
      g.fillStyle = "#7A3A2E"; g.fillRect(-24, -24, w + 48, hh + 48);
      for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * hh, s = r.range(25, 90), c = r.pick(["#8E4632", "#5E2C28", "#A8603A", "#6A3430"]); wrap(x, y, s * 1.4, (X, Y) => { g.globalAlpha = r.range(0.3, 0.6); blob(g, X, Y, s, s * 0.7, c, i + 1, 0.4, 14); }); }
      for (let i = 0; i < 2600; i++) {   // scoria clinkers: dark body, warm lit top
        const x = r() * w, y = r() * hh, s = r.range(2.5, 10), c = r.pick(["#5A2A26", "#3A1E20", "#8A4434", "#6E3A34", "#2A1A1C"]);
        wrap(x, y, s * 2, (X, Y) => { g.globalAlpha = 0.95; blob(g, X, Y + s * 0.2, s, s * 0.75, shade(c, -0.3), i * 2 + 1, 0.35, 9); blob(g, X - s * 0.15, Y - s * 0.15, s * 0.7, s * 0.45, shade(c, 0.22), i * 2 + 2, 0.35, 8); });
      }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0.06 });
    const groundMat = celMaterial({ color: "#ffffff", map: tex.texture, thresh: -0.35, rim: 0.12, shade: 0.7 });
    const T = gridTerrain(ctx, { xs: axis(-30, 30, 0, 0.025, 1.07, 2.5), zs: axis(-14, 24, 0.6, 0.025, 1.07, 2.5), h, material: groundMat, tile: 0.7 });
    group.add(T.mesh);
    // scoria: boulders off the path (silhouettes against the sky), stones and grit around the low cameras
    const camKeep = (x, z) => Math.hypot(x - 0.55, z - 1.38) > 0.12 && Math.hypot(x - 0.3, z - 1.15) > 0.1;
    const path = (x, z) => Math.abs(z) > 0.16 || x < -0.75 || x > 0.8;
    const bigs = scatter(3, 30, [-12, 12, -3, 8], { keep: (x, z) => Math.abs(z) > 0.9 && Math.hypot(x - 0.5, z - 1.3) > 1.2 && Math.hypot(x, z) > 1.4, dist: () => 0.9 })
      .map((p) => ({ x: p.x, z: p.z, s: 0.12 + 0.45 * p.u * p.u, sy: 0.6 + 0.5 * p.v }));
    const stones = scatter(4, 420, [-2.5, 2.5, -0.6, 2.6], { keep: (x, z) => path(x, z) && camKeep(x, z), dist: () => 0.045 })
      .map((p) => ({ x: p.x, z: p.z, s: 0.008 + 0.04 * p.u ** 3, sy: 0.55 + 0.5 * p.v, sink: 0.25 }));
    const rockMat = celMaterial({ color: "#6E3228", thresh: 0.0, rim: 0.5, shade: 0.8 });
    const stoneMat = celMaterial({ color: "#7E4234", thresh: -0.15, rim: 0.45, shade: 0.7 });
    const blackMat = celMaterial({ color: "#3A2426", thresh: -0.1, rim: 0.6, shade: 0.7 });
    const rocks = mergedRocks(ctx, bigs, rockMat, { seed: 5, heightAt: T.heightAt, name: "boulders", flat: 0.75 });
    const st1 = mergedRocks(ctx, stones.filter((_, i) => i % 3), stoneMat, { seed: 6, heightAt: T.heightAt, name: "scoria", detail: 0 });
    const st2 = mergedRocks(ctx, stones.filter((_, i) => !(i % 3)), blackMat, { seed: 7, heightAt: T.heightAt, name: "cinders", detail: 0 });
    inkable(rocks); inkable(st1); inkable(st2);
    group.add(rocks, st1, st2);
    return { group, heightAt: T.heightAt, colliders: [T.mesh, rocks], dispose() { tex.dispose(); } };
  },
};
