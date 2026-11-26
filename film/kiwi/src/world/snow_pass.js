// S08 / S10c — a snowy traverse under a huge mountain face. 3D: a trodden path (flat, y = 0) cut into a snow slope that
// rises behind (-Z) to a lip, banks along the path, a few rocks. Layers: cold sky, the face (couloirs, rock ribs,
// cornices, a broad central avalanche couloir at azimuth ~0), moraine ridges between.
import * as THREE from "three";
import { rng, smooth, clamp } from "../core/time.js";
import { stroke, blob } from "../core/paint.js";
import { makeNoise, frame, paintSky, paintRange, rangeProfile, stratus, cumulus, mistBand, shade, mix, rgba, smoothstep } from "./sky/kit.js";
import { gridTerrain, axis, tileTexture, mergedRocks, scatter } from "./sky/terrain.js";

const N = makeNoise(5);
const AV = { az: -1, w: 5.5 };   // the avalanche couloir (azimuth, half width deg at the top)
const FACE = rangeProfile({ base: 9, amp: 2.2, wave: 4, seed: 8, sharp: 0.8, jag: 0.25,
  peaks: [{ az: -2, el: 15.5, wl: 22, wr: 18, pow: 0.9 }, { az: -38, el: 21, wl: 14, wr: 16, pow: 1.2 }, { az: 32, el: 19, w: 14, pow: 1.2 }, { az: -70, el: 13, w: 14 }] });
const MORAINE = rangeProfile({ base: 1.2, amp: 1.2, wave: 6, seed: 14, sharp: 0.4, jag: 0.08, peaks: [{ az: -45, el: 3.6, w: 18 }, { az: 40, el: 3.2, w: 16 }] });
const lightAt = (F) => (px) => [0.55 + 0.15 * Math.sin(F.azAt(px) * 0.05), 0.55, 0.45];
const SKY = [[-6, "#DCE5F5"], [0, "#D8E3F6"], [6, "#C2D2EE"], [14, "#A3B8E0"], [26, "#8299CB"], [42, "#6880B6"], [70, "#566EA4"]];

export default {
  layers: [
    {
      name: "sky", depth: 3000, quality: 0.6, brush: { r: 3, paper: 0.05 }, flash: 0.2,
      paint(g, L) {
        const F = frame(L), r = rng(17);
        paintSky(g, L, F, { stops: SKY, seed: 2, glows: [{ az: 80, el: 40, r: 60, color: "#FFFFFF", a: 0.25 }] });
        for (let i = 0; i < 40; i++) {   // cirrus: thin wind-combed strands
          const az = r.range(-100, 80), el = r.range(14, 70), [x, y] = F.at(az, el);
          stratus(g, x, y, r.range(10, 30) * F.ppd, r.range(0.3, 0.8) * F.ppd, { shadow: "#B8C8E8", mid: "#D8E2F6", light: "#FFFFFF" }, 20 + i, { light: [0.4, -0.9], n: 8, tear: 1.2, angle: 0.12 + r.gauss() * 0.05 });
        }
        for (const [az, el, w, h, sd] of [[-60, 24, 16, 5, 1], [20, 28, 14, 4.5, 2], [60, 22, 18, 5, 3]]) {
          const [x, y] = F.at(az, el); cumulus(g, x, y, w * F.ppd, h * F.ppd, { shadow: "#9FB2DC", mid: "#D6E0F4", light: "#FFFFFF", rim: "#FFFFFF", base: "#AFC0E2" }, sd, { light: [0.5, -0.85], puffs: 18 });
        }
      },
    },
    {
      name: "face", depth: 900, quality: 0.8, brush: { r: 3, paper: 0.06 }, flash: 0.35,
      paint(g, L) {
        const F = frame(L), r = rng(31);
        const top = (px) => F.rowAt(px, FACE(F.azAt(px)));
        const pal = { lit: "#6E7AA4", mid: "#525C8C", shade: "#3A4272", deep: "#2C3360", snowLit: "#D8E0F2", snowMid: "#B2C1E4", snowShade: "#7E90C2", haze: "#BCCAE6", rim: "#FFFFFF" };
        const inAv = (px, py) => { const az = F.azAt(px), el = F.elevAt(px, py); return Math.abs(az - AV.az + 0.06 * (15 - el)) < AV.w * (0.7 + 0.04 * (15 - el)); };
        const res = paintRange(g, L, {
          top, bottom: L.h, pal, lightAt: lightAt(F), seed: 44, scale: 2.2 * F.ppd, f: 3, strokes: 1.2, rimW: 2, thresh: [0.38, 0.72], ribs: 1.6,
          snow: (px, py, d, up) => (inAv(px, py) ? 1 : 0) + (up < 0.36 + 0.22 * N.n(px / (F.ppd * 2), py / (F.ppd * 0.7)) ? 1 : 0) + (d < 0.7 * F.ppd ? 1 : 0),
          haze: (px, py) => 0.04 + 0.5 * smoothstep(F.rowAt(px, 6), F.rowAt(px, -0.5), py),
        });
        if (!res) return;
        // cornices: a bright overhanging lip along the crest, a blue shadow band under it, icicle drips
        const th = (x) => (0.25 + 0.35 * (0.5 + 0.5 * N.n(x / (3 * F.ppd), 7))) * F.ppd;
        const band = (a, b, col, alpha) => { g.globalAlpha = alpha; g.fillStyle = col; g.beginPath(); for (let x = -4; x <= L.w + 8; x += 4) g.lineTo(x, top(x) + a * th(x)); for (let x = L.w + 8; x >= -4; x -= 4) g.lineTo(x, top(x) + b(x) * th(x)); g.closePath(); g.fill(); };
        band(0.75, (x) => 1.5 + 0.8 * N.n(x / (2 * F.ppd), 9), "#7E92C6", 0.9);
        band(-0.18, () => 0.85, "#F4F7FD", 1);
        for (let x = 0; x < L.w; x += 7) if (r() < 0.06) { const t = top(x) + 0.8 * th(x); g.globalAlpha = 0.8; g.fillStyle = "#B8C8EA"; g.beginPath(); g.moveTo(x, t); g.lineTo(x + 3, t + r.range(0.4, 1.5) * F.ppd); g.lineTo(x + 6, t); g.fill(); }
        g.globalAlpha = 1;
        // the avalanche couloir: smooth, lit, slightly polished snow funnel with spindrift streaks
        g.save(); g.clip(res.path);
        for (let i = 0; i < 900; i++) {
          const el = r.range(0.5, 17), az = AV.az - 0.06 * (15 - el) + r.gauss() * AV.w * (0.35 + 0.025 * (15 - el)), [x, y] = F.at(az, el);
          g.globalAlpha = r.range(0.2, 0.5); stroke(g, x, y, Math.PI / 2 + r.gauss() * 0.15, r.range(0.6, 2.5) * F.ppd, r.range(0.1, 0.3) * F.ppd, r() < 0.6 ? "#E2E9F6" : "#B8C6E6", 0.8, r);
        }
        g.restore(); g.globalAlpha = 1;
        mistBand(g, L, { y: F.rowAt(L.w / 2, 1.0), h: 2.2 * F.ppd, color: "#E4ECFA", n: 90, alpha: [0.08, 0.2], len: [6 * F.ppd, 20 * F.ppd] });
      },
    },
    {
      name: "moraine", depth: 160, quality: 0.75, brush: { r: 3, paper: 0.06 }, flash: 0.4,
      paint(g, L) {
        const F = frame(L);
        const top = (px) => F.rowAt(px, MORAINE(F.azAt(px)));
        paintRange(g, L, {
          top, bottom: L.h, lightAt: lightAt(F), seed: 51, scale: 4 * F.ppd, f: 3, strokes: 1, rimW: 2, thresh: [0.34, 0.7], ribs: 0.8,
          pal: { lit: "#8C8FA8", mid: "#6C7092", shade: "#51577E", deep: "#424870", snowLit: "#F4F8FF", snowMid: "#D6E0F4", snowShade: "#A2B4DC", haze: "#D0DBF0", rim: "#FFFFFF" },
          snow: (px, py, d, up) => (up < 0.62 + 0.3 * N.n(px / (F.ppd * 1.2), py / (F.ppd * 0.5)) ? 1 : 0),
          haze: (px, py) => 0.1 + 0.3 * smoothstep(top(px), top(px) + 6 * F.ppd, py),
        });
      },
    },
  ],
  build(ctx) {
    const { celMaterial, inkable } = ctx;
    const group = new THREE.Group();
    const PW = 0.3;    // half width of the trodden path
    const bank = (z) => 0.045 * smoothstep(PW, PW + 0.12, Math.abs(z));
    const h = (x, z) => {
      const az = Math.abs(z);
      let y = bank(z) + (az < PW ? 0.004 * N.n(x * 6, z * 6) : 0.015 * N.fbm(x * 2, z * 2, 3));
      if (z < -PW) { const u = -z - PW; y += 0.3 * u * smooth(u / 0.8) - 0.12 * Math.max(0, u - 3.2) ** 1.5 * smooth((u - 3.2) / 2) + 0.55 * N.fbm(x * 0.32, z * 0.32, 3) * smooth((u - 0.8) / 3) + 0.04 * N.fbm(x * 1.6, z * 1.6, 2) * smooth(u / 0.6); }
      if (z > PW) { const u = z - PW; y -= 0.16 * u + 0.015 * u * u; }
      return y + 0.15 * smooth((Math.abs(x) - 6) / 10) * N.fbm(x * 0.2, 3.1, 2);
    };
    const snowTex = tileTexture(ctx, 1024, 1024, (g, w, hh, wrap) => {
      const r = rng(3); g.fillStyle = "#C2CDE6"; g.fillRect(-24, -24, w + 48, hh + 48);
      for (let i = 0; i < 700; i++) { const x = r() * w, y = r() * hh, len = r.range(60, 240), c = r.pick(["#B0BEDD", "#D2DBEE", "#A2B2D8", "#DCE3F2"]); wrap(x, y, len, (X, Y) => { g.globalAlpha = r.range(0.3, 0.7); stroke(g, X, Y, 0.15 + r.gauss() * 0.08, len, r.range(4, 14), c, 0.85, r); }); }
      for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * hh; wrap(x, y, 4, (X, Y) => { g.globalAlpha = 0.9; g.fillStyle = "#FFFFFF"; g.fillRect(X, Y, 2, 2); }); }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0.04 });
    const pathTex = tileTexture(ctx, 512, 512, (g, w, hh, wrap) => {
      const r = rng(4); g.fillStyle = "#AEBADA"; g.fillRect(-24, -24, w + 48, hh + 48);
      for (let i = 0; i < 300; i++) { const x = r() * w, y = r() * hh, s = r.range(8, 30); wrap(x, y, s * 1.5, (X, Y) => { g.globalAlpha = r.range(0.3, 0.6); blob(g, X, Y, s, s * 0.6, r.pick(["#A6B3D6", "#C6D0E8", "#9AA9D0"]), i + 1, 0.4, 12); }); }
      for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * hh; wrap(x, y, 40, (X, Y) => { g.globalAlpha = 0.6; blob(g, X, Y, 26, 14, "#A6B6DC", i + 99, 0.25, 14); g.globalAlpha = 0.5; blob(g, X - 4, Y - 3, 18, 8, "#9AACD6", i + 199, 0.25, 12); }); }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0.04 });
    const xs = axis(-30, 30, 0, 0.04, 1.06, 2.5);
    const zsBack = axis(-26, -PW, -PW, 0.03, 1.07, 2.5), zsPath = axis(-PW, PW, 0, 0.03, 1.0, 0.03), zsFront = axis(PW, 22, PW, 0.03, 1.07, 2.5);
    const snowMat = celMaterial({ color: "#ffffff", map: snowTex.texture, thresh: 0.68, rim: 0.25, shade: 0.9 });
    const pathMat = celMaterial({ color: "#ffffff", map: pathTex.texture, thresh: 0.6, rim: 0.2, shade: 0.9 });
    const parts = [gridTerrain(ctx, { xs, zs: zsBack, h, material: snowMat, tile: 1.6, name: "snowBack" }), gridTerrain(ctx, { xs, zs: zsPath, h, material: pathMat, tile: 0.8, name: "path" }), gridTerrain(ctx, { xs, zs: zsFront, h, material: snowMat, tile: 1.6, name: "snowFront" })];
    for (const p of parts) group.add(p.mesh);
    const heightAt = (x, z) => (z < -PW ? parts[0] : z > PW ? parts[2] : parts[1]).heightAt(x, z);
    const rocks = mergedRocks(ctx, scatter(9, 22, [-14, 14, -10, 6], { keep: (x, z) => Math.abs(z) > 0.9 && Math.hypot(x, z - 3.5) > 1.5, dist: () => 1.5 }).map((p) => ({ x: p.x, z: p.z, s: 0.15 + 0.5 * p.u * p.u, sy: 0.7 + 0.4 * p.v, sink: 0.12 })),
      celMaterial({ color: "#3A3F5E", thresh: 0.2, rim: 0.4, shade: 0.8 }), { seed: 2, heightAt, name: "rocks" });
    inkable(rocks); group.add(rocks);
    return {
      group, heightAt, colliders: [...parts.map((p) => p.mesh), rocks],
      // for FX: the avalanche couloir on the face (world points, metres) and where its run-out reaches the lip
      avalanche: { top: [-16, 220, -890], foot: [-12, 25, -880], lip: [-0.6, 1.0, -4.2], width: 180 },
      dispose() { snowTex.dispose(); pathTex.dispose(); },
    };
  },
};
