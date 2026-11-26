// S07 — a steep grey scree slope in driving rain. The path climbs toward +X (heightAt = slope * x on the path); the
// slope also rises behind (-Z) to a convex shoulder, and falls toward the camera. Loose stones near the camera.
// Layers: rain-grey sky with veils, cloud-wrapped dark peaks across the valley, bluffs above the scree.
import * as THREE from "three";
import { rng, smooth, clamp } from "../core/time.js";
import { stroke, blob } from "../core/paint.js";
import { makeNoise, frame, paintSky, paintRange, rangeProfile, stratus, cumulus, mistBand, shade, mix, rgba, smoothstep } from "./sky/kit.js";
import { gridTerrain, axis, tileTexture, mergedRocks, scatter } from "./sky/terrain.js";

const N = makeNoise(13);
const PEAKS = rangeProfile({ base: 3, amp: 2.5, wave: 5, seed: 31, sharp: 0.8, jag: 0.3, peaks: [{ az: -48, el: 13, wl: 10, wr: 14, pow: 1.1 }, { az: -18, el: 10, w: 9 }, { az: 12, el: 15, w: 12, pow: 1.2 }, { az: -80, el: 9, w: 14 }] });
const BLUFF = rangeProfile({ base: 8, amp: 3, wave: 4, seed: 7, sharp: 0.9, jag: 0.35, peaks: [{ az: 30, el: 26, w: 22, pow: 0.8 }, { az: 60, el: 34, w: 20 }] });
const SKY = [[-10, "#6E7A8E"], [0, "#6A768B"], [5, "#5C677B"], [12, "#4A5468"], [24, "#384154"], [45, "#283142"], [70, "#20283A"]];
const lightAt = () => () => [-0.35, 0.75, 0.55];
const rainVeils = (g, L, F, r, n, alpha) => {
  for (let i = 0; i < n; i++) {   // slanted veils of rain hanging from the cloud base
    const az = r.range(-100, 80), [x, y] = F.at(az, r.range(4, 18)), len = r.range(8, 24) * F.ppd;
    g.globalAlpha = r.range(...alpha); stroke(g, x, y + len * 0.4, Math.PI / 2 + 0.32, len, r.range(1.5, 5) * F.ppd, r() < 0.5 ? "#7F8BA0" : "#3E485C", 0.95, r);
  }
  g.globalAlpha = 1;
};

export default {
  layers: [
    {
      name: "sky", depth: 2000, quality: 0.6, brush: { r: 3, paper: 0.05 }, flash: 0.4,
      paint(g, L) {
        const F = frame(L), r = rng(5);
        paintSky(g, L, F, { stops: SKY, seed: 8, wash: 0.05 });
        // heavy rolling cloud base: dark bodies, pale edges toward the hidden light (upper left)
        for (let i = 0; i < 26; i++) {
          const az = r.range(-110, 90), el = r.range(8, 50), [x, y] = F.at(az, el), w = r.range(18, 40) * F.ppd, h = r.range(3, 7) * F.ppd;
          cumulus(g, x, y, w, h, { shadow: "#2C3446", mid: "#3E485C", light: "#5E6A80", rim: "#7C889C", base: "#262E3F" }, 40 + i, { light: [-0.45, -0.89], puffs: 16, rim: 0.5 });
        }
        for (let i = 0; i < 30; i++) {
          const az = r.range(-110, 90), el = r.range(5, 16), [x, y] = F.at(az, el);
          stratus(g, x, y, r.range(15, 40) * F.ppd, r.range(1, 2.5) * F.ppd, { shadow: "#4A5468", mid: "#5E697E", light: "#76829A" }, 90 + i, { light: [-0.3, -0.95], n: 12, tear: 0.6 });
        }
        rainVeils(g, L, F, r, 90, [0.12, 0.28]);
      },
    },
    {
      name: "peaks", depth: 1100, quality: 0.7, brush: { r: 3, paper: 0.06 }, flash: 0.45,
      paint(g, L) {
        const F = frame(L), r = rng(21);
        const top = (px) => F.rowAt(px, PEAKS(F.azAt(px)));
        paintRange(g, L, { top, bottom: L.h, lightAt: lightAt(), seed: 9, scale: 3 * F.ppd, f: 3, strokes: 1.1, rimW: 1.5, thresh: [0.45, 0.78], ribs: 1.4,
          pal: { lit: "#636C80", mid: "#4B5366", shade: "#363D50", deep: "#2B3144", snowLit: "#9AA6BA", snowShade: "#6A7690", haze: "#5E6A80", rim: "#8C98AE" },
          snow: (px, py, d, up) => (py < F.rowAt(px, 10.5) && up > 0.15 ? 1 : 0),
          haze: (px, py) => 0.2 + 0.7 * smoothstep(F.rowAt(px, 6), F.rowAt(px, 0), py) });
        // cloud wrapping the summits and lying across the faces
        for (let i = 0; i < 34; i++) {
          const az = r.range(-100, 50), el = r.range(5, 14), [x, y] = F.at(az, el);
          stratus(g, x, y, r.range(10, 30) * F.ppd, r.range(1, 2.6) * F.ppd, { shadow: "#4E586C", mid: "#65708A", light: "#7E8AA2" }, 200 + i, { light: [-0.4, -0.9], n: 14, tear: 0.7, angle: -0.03 });
        }
        mistBand(g, L, { y: F.rowAt(L.w / 2, 2), h: 4 * F.ppd, color: "#6A768C", n: 120, alpha: [0.1, 0.25], len: [8 * F.ppd, 26 * F.ppd] });
        rainVeils(g, L, F, r, 60, [0.1, 0.22]);
      },
    },
    {
      name: "bluffs", depth: 150, quality: 0.7, brush: { r: 3, paper: 0.07 }, flash: 0.5,
      paint(g, L) {
        const F = frame(L), r = rng(33);
        const top = (px) => F.rowAt(px, BLUFF(F.azAt(px)));
        const res = paintRange(g, L, { top, bottom: L.h, lightAt: lightAt(), seed: 12, scale: 3 * F.ppd, f: 3, strokes: 1.2, rimW: 1.5, thresh: [0.5, 0.8], ribs: 1.6,
          pal: { lit: "#727A88", mid: "#585F6E", shade: "#3E4454", deep: "#2E3342", haze: "#5E6A80", rim: "#9AA4B6" },
          haze: (px, py) => 0.25 * smoothstep(top(px) + 8 * F.ppd, top(px), py) });
        if (res) {   // scree fans pouring from the gullies
          g.save(); g.clip(res.path);
          for (let i = 0; i < 2500; i++) {
            const az = r.range(-40, 90), el = r.range(-6, 14), [x, y] = F.at(az, el);
            g.globalAlpha = r.range(0.25, 0.55); stroke(g, x, y, Math.PI / 2 - 0.5 + r.gauss() * 0.2, r.range(0.5, 2) * F.ppd, r.range(0.1, 0.3) * F.ppd, r.pick(["#8A909C", "#6C7280", "#9CA2AE"]), 0.8, r);
          }
          g.restore(); g.globalAlpha = 1;
        }
        // cloud swallowing the tops
        for (let i = 0; i < 24; i++) { const az = r.range(-20, 100), el = r.range(14, 30), [x, y] = F.at(az, el); stratus(g, x, y, r.range(12, 30) * F.ppd, r.range(2, 4) * F.ppd, { shadow: "#3E485C", mid: "#525D72", light: "#6E7A90" }, 300 + i, { light: [-0.4, -0.9], n: 14, tear: 0.6 }); }
        rainVeils(g, L, F, r, 40, [0.1, 0.2]);
      },
    },
  ],
  build(ctx) {
    const { celMaterial, inkable } = ctx;
    const slope = ctx.opts.slope ?? 0.45;
    const group = new THREE.Group();
    const PW = 0.32;
    const h = (x, z) => {
      const az = Math.abs(z), off = smoothstep(PW * 0.7, PW + 0.4, az);   // 0 on the path, 1 away from it
      let y = slope * x + (1 - off) * 0.004 * N.n(x * 9, z * 9);
      if (z < 0) { const u = Math.max(0, -z - PW * 0.5); y += 0.22 * u * smooth(u / 0.6) - 0.09 * Math.max(0, u - 2.6) ** 2 + 0.5 * N.fbm(x * 0.45, 7.7, 3) * smooth((u - 1.5) / 1.5); }
      if (z > 0) { const u = Math.max(0, z - PW * 0.5); y -= 0.28 * u * smooth(u / 0.6); }
      return y + off * (0.05 * N.fbm(x * 1.3, z * 1.3, 3) + 0.35 * N.fbm(x * 0.18, z * 0.25, 3) * smooth((az - 1) / 3));
    };
    const tex = tileTexture(ctx, 1024, 1024, (g, w, hh, wrap) => {
      const r = rng(19); g.fillStyle = "#7A818E"; g.fillRect(-24, -24, w + 48, hh + 48);
      for (let i = 0; i < 4200; i++) {   // packed angular stones: dark gap below, lit facet on top-left, wet glint
        const x = r() * w, y = r() * hh, s = r.range(4, 16), c = r.pick(["#9AA1AC", "#868D9A", "#AEB3BC", "#767D8A", "#929AA6", "#6E6A6E"]);
        wrap(x, y, s * 2, (X, Y) => {
          g.globalAlpha = 1; blob(g, X + s * 0.15, Y + s * 0.2, s, s * 0.7, "#4A505C", i * 3 + 1, 0.35, 6);
          blob(g, X, Y, s * 0.9, s * 0.62, c, i * 3 + 2, 0.35, 6);
          g.globalAlpha = 0.6; blob(g, X - s * 0.25, Y - s * 0.2, s * 0.4, s * 0.22, shade(c, 0.25), i * 3 + 3, 0.3, 5);
        });
      }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0.06 });
    const mat = celMaterial({ color: "#ffffff", map: tex.texture, thresh: 0.8, rim: 0.2, shade: 0.75 });
    const T = gridTerrain(ctx, { xs: axis(-26, 26, 0, 0.04, 1.06, 2.5), zs: axis(-16, 20, 0, 0.03, 1.06, 2.5), h, material: mat, tile: 0.9 });
    group.add(T.mesh);
    const onPath = (x, z) => Math.abs(z) < PW + 0.05 && x > -1.0 && x < 0.9;
    const camFree = (x, z) => Math.hypot(x, z - 4.15) > 0.6;
    const near = scatter(2, 340, [-3, 3, -1.2, 3.4], { keep: (x, z) => !onPath(x, z) && camFree(x, z), dist: () => 0.07 })
      .map((p) => ({ x: p.x, z: p.z, s: 0.02 + 0.11 * p.u ** 3, sy: 0.55 + 0.4 * p.v, sink: 0.2 }));
    const crest = scatter(8, 26, [-14, 14, -5, -2.2], { keep: (x, z) => x < 6, dist: () => 1.2 }).map((p) => ({ x: p.x, z: p.z, s: 0.3 + 0.7 * p.u * p.u, sy: 0.7 + 0.5 * p.v, sink: 0.15 }));
    const big = [...crest, ...scatter(3, 40, [-16, 16, -8, 6], { keep: (x, z) => !onPath(x, z) && Math.hypot(x, z - 4) > 1.6 && Math.abs(z) > 0.8, dist: () => 1.1 })
      .map((p) => ({ x: p.x, z: p.z, s: 0.2 + 0.6 * p.u * p.u, sy: 0.6 + 0.4 * p.v, sink: 0.2 }))];
    const stoneMat = celMaterial({ color: "#8E95A2", thresh: 0.05, rim: 0.5, shade: 0.8, hi: 0.25 });
    const darkMat = celMaterial({ color: "#555B68", thresh: 0.05, rim: 0.5, shade: 0.8, hi: 0.2 });
    const st1 = mergedRocks(ctx, near.filter((_, i) => i % 2), stoneMat, { seed: 4, heightAt: T.heightAt, name: "stones", detail: 0 });
    const st2 = mergedRocks(ctx, near.filter((_, i) => !(i % 2)), darkMat, { seed: 5, heightAt: T.heightAt, name: "stones2", detail: 0 });
    const rocks = mergedRocks(ctx, big, stoneMat, { seed: 6, heightAt: T.heightAt, name: "boulders" });
    inkable(st1); inkable(st2); inkable(rocks);
    group.add(st1, st2, rocks);
    return { group, heightAt: T.heightAt, colliders: [T.mesh, rocks], dispose() { tex.dispose(); } };
  },
};
