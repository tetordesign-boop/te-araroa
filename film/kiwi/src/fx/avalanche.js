// AVALANCHE (FX). spec {t0, hit, clear, seed}.
//   t0 → hit: the snow face releases at the top of the frame; a billowing powder cloud of cel-shaded, ink-lined puffs
//             races down and toward the camera, puffs rolling and growing as they come (accelerating front).
//   hit:      the cloud engulfs the lens: big puffs right in front of the camera cover the whole frame (white-out).
//   hit → clear: the near puffs peel away (those over the kiwi first), drifting out and shrinking, powder streaks fly
//             past, a pale haze lifts; by `clear` he is revealed, still walking.
// Pure function of t (on twos).
import * as THREE from "three";
import { Sprites, Puffs, camBasis, h1, smooth, subjectDist, anchor } from "./_lib.js";

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:avalanche";
    const { t0, hit, clear } = spec, seed = spec.seed ?? 3;
    const snow = new THREE.Color("#F2F6FF").lerp(new THREE.Color(ctx.rig.key.color), 0.15);
    const far = new Puffs(ctx, { max: 300, thresh: 0.22, hi: 0.5, seed, lump: 0.3, name: "avalanche-cloud" });
    const near = new Puffs(ctx, { max: 48, thresh: 0.2, hi: 0.5, seed: seed + 5, lump: 0.2, fog: 0, name: "avalanche-near" });
    const streaks = new Sprites(ctx, { max: 400, flash: 0, fog: 0.2, renderOrder: 25, name: "avalanche-powder" });
    group.add(far.mesh, near.mesh, streaks.mesh);
    const N = 280, dur = Math.max(0.3, hit - t0), D0 = 70;
    const R = (i, k) => h1(i + seed * 997, k, 11);
    const front = (u) => D0 * Math.pow(Math.max(0, 1 - u), 1.6) - 3 * Math.max(0, u - 1);   // distance of the front
    let haze = 0;
    return {
      object: group,
      update(t, t2, ctx) {
        far.begin(); near.begin(); streaks.begin(ctx);
        const cb = camBasis(ctx.camera);
        const F = new THREE.Vector3(cb.fwd.x, 0, cb.fwd.z).normalize(), Rt = new THREE.Vector3(-F.z, 0, F.x);
        const groundY = ctx.heightAt(cb.pos.x, cb.pos.z);
        const u = (t2 - t0) / dur, span = Math.max(0.2, clear - hit);
        // ---- the rolling cloud
        for (let i = 0; i < N; i++) {
          const ub = (i / N) * 0.98 + R(i, 1) * 0.02, tb = t0 + ub * dur, a = t2 - tb;
          if (a < 0) continue;
          const db = front(ub) + R(i, 2) * 8;
          const d = db - (db - front(u)) * (0.7 + 0.2 * R(i, 3));
          const thin = 1 - smooth((t2 - hit) / (span * 0.32));
          let r = (0.038 * db + 0.25) * (0.6 + 0.6 * R(i, 4)) * (1 - Math.exp(-a * 3.5)) * (1 + 0.2 * a) * thin;
          r = Math.min(r, 0.4 * d) * smooth((d - 0.6) / 2.5);           // shrink away as they pass the lens
          if (r < 0.01) continue;
          const lat = (R(i, 5) - 0.5) * 2 * (db * 0.8 + 4) * (0.35 + 0.65 * d / db);
          const yb = 0.3 * db * (0.85 + 0.3 * R(i, 6));
          const y = groundY + yb * (d / db) + r * 0.55 + 0.4 * a * (0.5 + R(i, 7));
          const p = cb.pos.clone().addScaledVector(F, d).addScaledVector(Rt, lat); p.y = y;
          far.add(p, r, snow, R(i, 8) * 6 + a * 0.8);
        }
        // ---- engulf: puffs right in front of the lens
        const D = subjectDist(ctx), tanH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2), asp = ctx.camera.aspect;
        const kp = anchor(ctx, "body", [0, 0.3, 0]).project(ctx.camera);
        for (let k = 0; k < 40; k++) {
          const gx = (k % 8) / 7 * 2.4 - 1.2 + (R(k, 21) - 0.5) * 0.3, gy = Math.floor(k / 8) / 4 * 2.4 - 1.2 + (R(k, 22) - 0.5) * 0.3;
          const z = Math.min(D * 0.75, 1.6) * (0.3 + 0.6 * R(k, 23));
          const ta = hit - 0.16 + 0.1 * R(k, 24);
          const dk = Math.hypot(gx - kp.x, gy - kp.y);
          const tl = hit + 2 / 24 + span * (0.02 + 0.3 * Math.min(1, dk / 1.6) + 0.15 * R(k, 25));
          const inn = smooth((t2 - ta) / 0.12), out = smooth((t2 - tl) / (span * 0.3));
          if (inn <= 0 || out >= 1) continue;
          const away = out * 0.9;
          const sx = gx + (gx - kp.x) * away, sy = gy + (gy - kp.y) * away + out * 0.3;
          const zz = z * (1 + 0.4 * (1 - inn)) * (1 + out * 0.6);
          const p = cb.pos.clone().addScaledVector(cb.fwd, zz).addScaledVector(cb.right, sx * zz * tanH * asp).addScaledVector(cb.up, sy * zz * tanH);
          const r = Math.min(0.62 * zz * tanH * (1.2 + 0.4 * R(k, 26)) * inn * (1 - out), zz - 0.03);
          near.add(p, r, snow, R(k, 27) * 6 + t2 * 0.5);
        }
        // ---- powder streaks flying past
        const env = smooth((t2 - (hit - 0.3)) / 0.3) * (1 - smooth((t2 - (hit + span * 0.5)) / (span * 0.6)));
        if (env > 0.01) {
          const vel = F.clone().multiplyScalar(-10).addScaledVector(Rt, 3).setY(-0.5).multiplyScalar(Math.min(1, D / 3) + 0.2);
          const B = Math.max(1.2, D * 1.4);
          for (let i = 0; i < 300; i++) {
            const base = new THREE.Vector3(R(i, 31) * B * 9, R(i, 32) * B * 9, R(i, 33) * B * 9).addScaledVector(vel, t2);
            const C = cb.pos.clone().addScaledVector(cb.fwd, B * 0.5);
            const p = new THREE.Vector3(); for (const ax of ["x", "y", "z"]) { const v = base[ax] - C[ax] + B / 2; p[ax] = C[ax] - B / 2 + (v - B * Math.floor(v / B)); }
            if (p.distanceTo(cb.pos) < 0.1) continue;
            if (R(i, 34) > env) continue;
            streaks.add(p, vel.clone().multiplyScalar(0.035), 0.006, 1.2, "#FFFFFF", 0.8, 0, 0, 0, 0.2);
          }
        }
        haze = smooth((t2 - (hit - 0.1)) / 0.1) * (1 - smooth((t2 - hit - 2 / 24) / (span * 0.9)));
        far.end(); near.end(); streaks.end();
      },
      look(t) {
        if (t >= hit && t < hit + 3 / 24) return null;       // let the impact frames read
        return haze > 0.01 ? { fade: 0.18 * haze, fadeColor: "#EEF3FF" } : null;
      },
      dispose() { far.dispose(); near.dispose(); streaks.dispose(); },
    };
  },
};
