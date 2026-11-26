// ROCKS (FX). spec {times, seed}. On each time a big scree rock (plus two small companions) bounds down the slope past
// the kiwi: the key bounce lands right beside him on the beat. Faceted cel rocks with ink, rolling; squash-and-stretch
// smear right after each bounce, ink speed lines while flying, a cel dust puff on every bounce, flung pebbles.
// Event 0 passes behind him, event 1 in front (closer to camera), alternating. Pure function of t (on twos).
import * as THREE from "three";
import { Sprites, Puffs, kiwiXZ, h1, smooth } from "./_lib.js";

function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.78 + 0.3 * h1(Math.round(v.x * 50), Math.round(v.y * 50) + seed, Math.round(v.z * 50));
    v.multiplyScalar(k); v.y *= 0.78; p.setXYZ(i, v.x, v.y, v.z);
  }
  const n = g.toNonIndexed(); n.computeVertexNormals(); g.dispose(); return n;
}

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:rocks";
    const seed = spec.seed ?? 9, rig = ctx.rig;
    const rockCol = new THREE.Color("#7C7F86").lerp(new THREE.Color(rig.key.color), 0.15);
    const dustCol = new THREE.Color("#B8B2A6").lerp(new THREE.Color("#FFFFFF"), 0.2);
    const geo = rockGeo(seed);
    const mat = ctx.celMaterial({ color: rockCol, thresh: 0.12, hi: 0.15, rim: 1 });
    const events = spec.times.map((T, k) => {
      const [kx] = kiwiXZ(ctx.shot, T);
      const front = k % 2 === 1;
      const z0 = front ? 0.72 : -0.55;
      const rocks = [];
      for (let m = 0; m < 3; m++) {
        const main = m === 0, R = (q) => h1(seed + k * 31 + m * 7, q, 5);
        const r = main ? 0.13 + 0.04 * R(1) : 0.045 + 0.025 * R(1);
        const dt = main ? 0.3 : 0.24 + 0.06 * R(2), toff = main ? 0 : 0.06 + 0.18 * R(3);
        const z = z0 + (main ? 0 : (R(4) - 0.5) * 0.5);
        const xs = [], ts = [], hs = [];
        for (let j = -5; j <= 4; j++) {
          ts.push(T + toff + j * dt);
          xs.push(kx + 0.12 - j * (main ? 1.0 : 0.85) + (j ? (h1(k, m, j) - 0.5) * 0.25 : 0));
          hs.push((j === 0 ? 0.32 : 0.2 + 0.16 * h1(k, m, j + 20)) * (main ? 1 : 0.6));
        }
        rocks.push({ r, z, xs, ts, hs, dt, main, spin: 1 + R(6) });
      }
      return { T, rocks };
    });
    const nRocks = events.length * 3;
    const mesh = new THREE.InstancedMesh(geo, mat, nRocks); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.name = "rocks"; ctx.inkable(mesh);
    const dust = new Puffs(ctx, { max: 160, thresh: 0.15, hi: 0.4, seed: seed + 1, name: "rock-dust" });
    const debris = new Sprites(ctx, { max: 400, flash: 0.3, fog: 0.5, renderOrder: 15, name: "rock-debris" });
    const lines = new Sprites(ctx, { max: 120, flash: 0, fog: 0.2, renderOrder: 16, name: "rock-lines" });
    group.add(mesh, dust.mesh, debris.mesh, lines.mesh);
    const M = new THREE.Matrix4(), S = new THREE.Matrix4(), Rz = new THREE.Matrix4(), Rr = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    const inkCol = new THREE.Color(rig.ink);

    /** State of a rock at t: position, velocity, segment index and phase. */
    function rockAt(rk, t) {
      const { xs, ts, hs, z, r } = rk, n = ts.length;
      let j = 0; while (j < n - 2 && t >= ts[j + 1]) j++;
      const u = (t - ts[j]) / (ts[j + 1] - ts[j]);
      const y0 = ctx.heightAt(xs[j], z), y1 = ctx.heightAt(xs[j + 1], z);
      const x = xs[j] + (xs[j + 1] - xs[j]) * u;
      const y = y0 + (y1 - y0) * u + 4 * hs[j] * u * (1 - u) + r * 0.8;
      const vx = (xs[j + 1] - xs[j]) / rk.dt, vy = ((y1 - y0) + 4 * hs[j] * (1 - 2 * u)) / rk.dt;
      return { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, 0), j, u };
    }

    return {
      object: group,
      update(t, t2, ctx) {
        dust.begin(); debris.begin(ctx); lines.begin(ctx);
        let i = 0;
        for (const ev of events) for (const rk of ev.rocks) {
          const st = rockAt(rk, t2);
          const ang = -(t2 - ev.T) * (st.v.x / rk.r) * 0.6 * rk.spin;
          // smear: stretched along the flight right after a bounce, squashed into the ground just before it
          const sp = st.v.length(), va = Math.atan2(st.v.y, st.v.x);
          const stretch = st.u < 0.18 ? 0.45 : st.u > 0.9 ? -0.2 : 0.12;
          Rz.makeRotationZ(va); S.makeScale(1 + stretch, 1 - stretch * 0.45, 1);
          E.set(0.4 * rk.spin, 0.3, ang); Q.setFromEuler(E); Rr.makeRotationFromQuaternion(Q);
          M.copy(Rz).multiply(S).multiply(new THREE.Matrix4().makeRotationZ(-va)).multiply(Rr).multiply(new THREE.Matrix4().makeScale(rk.r, rk.r, rk.r));
          M.setPosition(st.p); mesh.setMatrixAt(i++, M);
          // speed lines trailing the big rocks
          if (rk.main && sp > 1.5) {
            const back = st.v.clone().normalize();
            const nrm = new THREE.Vector3(-back.y, back.x, 0);
            for (let q = 0; q < 4; q++) {
              const off = (q - 1.5) * rk.r * 0.55, len = rk.r * (2.2 + 1.6 * h1(q, Math.floor(t2 * 12), 2));
              const head = st.p.clone().addScaledVector(nrm, off).addScaledVector(back, -rk.r * 1.1);
              lines.add(head, back.clone().multiplyScalar(len), 0.004, 1.4, inkCol, 0.75, 0, 0, 0, 0.1);
            }
          }
          // per bounce: dust puff and pebbles
          for (let b = 1; b < rk.ts.length - 1; b++) {
            const a = t2 - rk.ts[b]; if (a < 0 || a > 1.1) continue;
            const bx = rk.xs[b], by = ctx.heightAt(bx, rk.z);
            const big = rk.main ? 1 : 0.5;
            for (let q = 0; q < 9; q++) {
              const R = (k) => h1(b * 13 + q, k, rk.r * 1000);
              const grow = 1 - Math.exp(-a * 10), shrink = 1 - smooth((a - 0.15) / (0.35 + 0.2 * R(1)));
              const rad = rk.r * big * (0.25 + 0.35 * R(2)) * grow * shrink;
              const ang = (q / 9) * Math.PI * 2 + R(3);
              const spread = (0.12 + 0.3 * R(4)) * grow * big;
              const dx = Math.cos(ang) * spread * 1.3 - 0.1 * a, dy = 0.02 + Math.abs(Math.sin(ang)) * spread * 0.5 + 0.12 * a, dz = Math.sin(ang) * spread * 0.6;
              dust.add([bx + dx, by + dy, rk.z + dz], rad, dustCol, R(6) * 6 + a, [1.3, 0.8, 1]);
            }
            for (let q = 0; q < (rk.main ? 8 : 3); q++) {
              const R = (k) => h1(b * 17 + q, k, rk.r * 777);
              const vx = (R(1) - 0.35) * 1.8, vy = 1.2 + 1.4 * R(2), vz = (R(3) - 0.5) * 1.2;
              const x = bx + vx * a, z = rk.z + vz * a; let y = by + vy * a - 4.9 * a * a;
              const gy = ctx.heightAt(x, z); const landed = y < gy; if (landed) y = gy + 0.005;
              const fade = 1 - smooth((a - 0.6) / 0.4);
              const vel = landed ? [0, 0, 0] : [vx * 0.03, (vy - 9.8 * a) * 0.03, vz * 0.03];
              debris.add([x, y, z], vel, 0.012 + 0.012 * R(4), 1.8, rockCol, fade, 6);
            }
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        dust.end(); debris.end(); lines.end();
      },
      dispose() { geo.dispose(); mat.dispose(); dust.dispose(); debris.dispose(); lines.dispose(); },
    };
  },
};
