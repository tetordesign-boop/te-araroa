// S13/S14 — the same ridge after the storm: total calm, indigo-to-peach sky, a low sun off to the right, distant
// peaks in haze. S14 is 6 cm above the ground looking at his foot: dense grit and stones around the foot, tussock that
// ripples outward when the foot plants (the shockwave beat).
import * as THREE from "three";
import { rng } from "../core/time.js";
import { buildRidge, ridgeLayers, RIDGE_PAL, tussockBend } from "./sky/ridge.js";
import { frame, paintSky, cumulus, stratus, smoothstep } from "./sky/kit.js";
import { mergedRocks, scatter } from "./sky/terrain.js";

const SKY = [[-10, "#F0B48E"], [0, "#F6C29A"], [3, "#F5C39E"], [7, "#EAB4A2"], [12, "#CFA2AC"], [19, "#A592B6"], [28, "#7473AC"], [42, "#4A4A93"], [60, "#30337F"], [85, "#272B72"]];
const CLOUD = { shadow: "#9284B2", mid: "#C8A2B6", light: "#FFD4B4", rim: "#FFF0DE", base: "#A88CB2" };

export default {
  layers: [
    {
      name: "sky", depth: 3000, quality: 0.7, blur: 1, brush: { r: 3, paper: 0.05 }, flash: 0.2,
      paint(g, L, ctx) {
        const F = frame(L), r = rng(808);
        paintSky(g, L, F, { stops: SKY, seed: 3, glows: [{ az: 22, el: 4, r: 34, color: "#FFE4BC", a: 0.6 }, { az: 22, el: 2, r: 70, color: "#F8C49A", a: 0.28 }] });
        // sunset striations low in the sky, lit from below-right
        for (let i = 0; i < 26; i++) {
          const az = r.range(-90, 50), el = r.range(2.5, 11), [x, y] = F.at(az, el), w = r.range(10, 26) * F.ppd, h = r.range(0.5, 1.2) * F.ppd;
          const warm = smoothstep(-60, 20, az);
          stratus(g, x, y, w, h, { shadow: warm > 0.5 ? "#C79DB0" : "#A38FB6", mid: "#E2AEAE", light: "#FFDDBE" }, 50 + i, { light: [0.5, 0.86], n: 12, tear: 0.6 });
        }
        // storm remnants: a few big cumulus, tops lit warm from the right
        for (const [az, el, w, h, sd] of [[-58, 16, 20, 7, 1], [-33, 24, 16, 6, 2], [-12, 15, 12, 4.5, 3], [-78, 30, 22, 7, 4], [-45, 40, 18, 5, 5], [8, 30, 14, 5, 6], [-20, 52, 26, 7, 7]]) {
          const [x, y] = F.at(az, el);
          cumulus(g, x, y, w * F.ppd, h * F.ppd, CLOUD, 90 + sd, { light: [0.8, -0.45], puffs: 20, rim: 0.85 });
        }
        // high altocumulus field (mostly seen in 9:16)
        for (let i = 0; i < 120; i++) {
          const az = r.range(-95, 45), el = r.range(32, 75), [x, y] = F.at(az, el), s = r.range(1.2, 3.5) * F.ppd;
          stratus(g, x, y, s * 2.4, s * 0.5, { shadow: "#7E7AB4", mid: "#A797C0", light: "#F2C8C0" }, 300 + i, { light: [0.6, 0.8], n: 5, tear: 0.2 });
        }
      },
    },
    ...ridgeLayers("calm", { quality: 0.7, blur: 1 }),
  ],
  build(ctx) {
    const { celMaterial, inkable, shot, T } = ctx;
    const foot = shot.id === "S14";
    const R = buildRidge(ctx, { pal: RIDGE_PAL.calm, detail: foot ? "foot" : "mid", tussockN: 170, clear: [[0.62, 1.25, 0.3], [0.42, 0.6, 0.14]], sight: [[0.42, 0.6, 0.05, 0.02, 0.1], [0.6, 1.2, 0.0, 0.2, 0.16]] });
    let grit = null;
    if (foot) {   // a dense patch of grit and small stones in front of the foot
      const pts = scatter(31, 520, [-0.7, 1.0, -0.5, 0.9], {
        keep: (x, z) => Math.hypot(x - 0.03, z + 0.03) > 0.1 && Math.hypot(x - 0.17, z - 0.03) > 0.1 && Math.hypot(x - 0.42, z - 0.6) > 0.07 && Math.hypot(x, z) < 1.1,
        dist: () => 0.018,
      });
      grit = mergedRocks(ctx, pts.map((p) => ({ x: p.x, z: p.z, s: 0.004 + 0.016 * p.u * p.u, sy: 0.6 + 0.5 * p.v, sink: 0.3 })), celMaterial({ color: "#A49A98", thresh: -0.25, rim: 0.3, shade: 0.5 }), { seed: 12, heightAt: R.heightAt, name: "grit", detail: 0 });
      R.group.add(grit);
    }
    const sw = (shot.fx ?? []).find((f) => f.type === "shockwave");
    let wave = null;
    return {
      group: R.group, heightAt: R.heightAt, colliders: R.colliders,
      ready(c) {   // where the foot plants: the shockwave's origin
        if (sw && c.kiwi) { c.kiwi.update(sw.t, sw.t, shot.kiwi, c); const p = c.kiwi.anchor(sw.anchor ?? "footL"); wave = { x: p.x, z: p.z, t: sw.t, speed: 2.4, amp: 0.45, len: 0.45, reach: 3.5, freq: 10 }; }
      },
      update(t, t2) {
        const bend = tussockBend(t2, { breeze: 0.018, wave });
        for (const cl of R.tussock) cl.pose(bend);
      },
      dispose() { R.dispose(); },
    };
  },
};
