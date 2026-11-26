// S12 — the storm drains into an indigo spiral around the sun. The kiwi stands on the ridge top at the origin; the
// camera pulls back and tilts up. Sky = vortex dome (sky/vortex.js); land = the shared Act-3 ridge (sky/ridge.js).
import { buildRidge, ridgeLayers, RIDGE_PAL, tussockBend } from "./sky/ridge.js";
import { vortexDome } from "./sky/vortex.js";

export const SUN_DIR = [-3.4, 9.6, -50.5];   // from the final camera toward the tilt target, a touch higher

export default {
  layers: ridgeLayers("spiral", { quality: 0.6 }),
  build(ctx) {
    const { T } = ctx;
    const sp = ctx.opts.spiral ?? { t0: ctx.shot.t0, t1: ctx.shot.t1 };
    const R = buildRidge(ctx, {
      pal: RIDGE_PAL.spiral, tussockN: 120,
      clear: [[0.75, 1.7, 0.35], [3.4, 10.5, 1.0]],
      sight: [[0.75, 1.7, 3.4, 10.5, 0.45], [0, 0, 3.4, 10.5, 0.25]],
    });
    const dome = vortexDome(ctx, { sunDir: SUN_DIR, t0: sp.t0, t1: sp.t1 });
    R.group.add(dome.mesh);
    return {
      group: R.group, heightAt: R.heightAt, colliders: R.colliders,
      update(t, t2, c) {
        dome.update(t, t2, c);
        const s = dome.state(t2);
        // the wind spirals with the sky: tussock leans harder as the swirl accelerates (on twos)
        const bend = tussockBend(t2, { breeze: 0.05 + 0.12 * s.k });
        for (const cl of R.tussock) cl.pose(bend);
        // the land catches more light as the sun's glow grows
        for (const l of c.layers ?? []) {
          const b = T.lerp(0.86, 1.06, s.glow) * (l.name === "alps" ? 1.04 : 1);
          l.mesh.material.uniforms.uTint.value.setRGB(b, b * 0.98, b * 0.97);
        }
      },
      dispose() { R.dispose(); dome.dispose(); },
    };
  },
};
