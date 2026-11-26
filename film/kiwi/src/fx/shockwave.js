// SHOCKWAVE (FX). spec {t, anchor}. The climax: the foot lands on `t` and a ring bursts outward along the ground.
//   - light flare at the contact: star spikes + anamorphic streak + warm glow (bloom-bright), decaying over ~0.5 s
//   - the ground ring: an expanding annulus, white-hot leading edge with a thin orange core band behind it
//   - a low air wall riding the ring (translucent), seen at grazing angle from the 6 cm camera
//   - tussock blades around the foot bent flat as the ring passes, springing back with a damped wobble
//   - cel dust puffs kicked up along the ring, and seeds/specks flung outward
// Pure function of t (on twos for the drawn parts).
import * as THREE from "three";
import { Sprites, Puffs, h1, smooth, ORANGE } from "./_lib.js";

const ringFrag = /* glsl */ `
uniform float uR; uniform float uW; uniform float uA; uniform vec3 uHot; uniform vec3 uOrange; varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0; float r = sqrt(dot(p, p) + 1e-6);         // 0..1 = 0..uR
  float lead = 1.0 - smoothstep(0.0, 0.012, r - 1.0) ;
  float band = smoothstep(1.0 - uW, 1.0 - uW * 0.25, r) * lead;
  float hot = smoothstep(1.0 - uW * 0.22, 1.0 - 0.01, r) * lead;
  float orange = smoothstep(1.0 - uW * 0.55, 1.0 - uW * 0.35, r) * (1.0 - smoothstep(1.0 - uW * 0.3, 1.0 - uW * 0.2, r));
  vec3 c = mix(uHot * 0.8, uOrange, orange * 0.85); c = mix(c, vec3(1.0), hot);
  float a = (band * 0.55 + hot * 0.6 + orange * 0.4) * uA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(c * a, a);
}`;
const wallFrag = /* glsl */ `
uniform float uA; uniform vec3 uCol; varying vec2 vUv;
void main(){ float a = (1.0 - vUv.y) * (1.0 - vUv.y) * uA * (0.6 + 0.4 * smoothstep(0.85, 1.0, 1.0 - vUv.y)); if (a < 0.003) discard; gl_FragColor = vec4(uCol * a, a); }`;
const vsUv = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:shockwave";
    const T = spec.t, rig = ctx.rig;
    const hot = new THREE.Color(rig.key.color).lerp(new THREE.Color("#FFFFFF"), 0.5);
    const add = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uW: { value: 0.3 }, uA: { value: 0 }, uHot: { value: hot }, uOrange: { value: new THREE.Color(ORANGE) } }, vertexShader: vsUv, fragmentShader: ringFrag, ...add, side: THREE.DoubleSide,
    }));
    ring.name = "shock-ring"; ring.frustumCulled = false; ring.renderOrder = 30;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uCol: { value: hot.clone() } }, vertexShader: vsUv, fragmentShader: wallFrag, ...add, side: THREE.DoubleSide,
    }));
    wall.name = "shock-wall"; wall.frustumCulled = false; wall.renderOrder = 31;
    const flare = new Sprites(ctx, { max: 40, blend: "add", flash: 0, fog: 0, renderOrder: 33, name: "shock-flare" });
    const specks = new Sprites(ctx, { max: 300, flash: 0, fog: 0.2, renderOrder: 32, name: "shock-specks" });
    const dust = new Puffs(ctx, { max: 90, thresh: -0.35, hi: 0.6, seed: 21, lump: 0.25, shade: 0.6, name: "shock-dust" });
    const dustCol = new THREE.Color("#F0DDB8").lerp(new THREE.Color(rig.key.color), 0.3);
    // tussock blades around the foot (bend about their base)
    const bladeGeo = new THREE.PlaneGeometry(1, 1, 1, 4).translate(0, 0.5, 0);
    { const p = bladeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y) * 0.5); } }
    const NB = 200;
    const bladeMat = ctx.celMaterial({ color: new THREE.Color("#E2B464").lerp(new THREE.Color(rig.key.color), 0.25), side: THREE.DoubleSide, thresh: -1.2, rim: 1.0, fog: 0.5 });
    const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, NB); blades.frustumCulled = false; blades.name = "shock-tussock";
    blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(blades, dust.mesh, ring, wall, specks.mesh, flare.mesh);
    const Rmax = 2.6, rate = 4.2;
    const Rt = (u) => (u <= 0 ? 0 : Rmax * (1 - Math.exp(-u * rate)));
    const tHit = (d) => -Math.log(Math.max(1e-4, 1 - d / Rmax)) / rate;           // when the ring reaches distance d
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
    // where the foot lands: pose the kiwi once at the plant time (pure: the stage re-poses it every frame anyway)
    let foot = new THREE.Vector3();
    if (ctx.kiwi && ctx.shot.kiwi) { ctx.kiwi.update(T, ctx.T.twos(T), ctx.shot.kiwi, ctx); foot = ctx.kiwi.anchor(spec.anchor ?? "footL").clone(); }
    return {
      object: group,
      update(t, t2, ctx) {
        flare.begin(ctx); specks.begin(ctx); dust.begin();
        // the contact point: where the foot is planted (the foot is planted from `t` on; before that its landing spot)
        const c = foot;
        const gy = ctx.heightAt(c.x, c.z);
        const C = new THREE.Vector3(c.x, gy, c.z);
        const u = t - T, u2 = t2 - T;
        const cam = ctx.camera.position;
        // ---- tussock (always there, calm sway before the hit)
        for (let i = 0; i < NB; i++) {
          const R = (k) => h1(i, k, 77);
          const d = 0.07 + 0.6 * Math.pow(R(1), 0.75), th = R(2) * Math.PI * 2;
          const x = C.x + Math.cos(th) * d, z = C.z + Math.sin(th) * d;
          const toCam = Math.hypot(x - cam.x, z - cam.z);
          const h = (0.05 + 0.08 * R(3)) * (toCam < 0.2 ? 0 : 1);
          let bend = 0.08 * Math.sin(t2 * 1.3 + i) + 0.15 * (R(4) - 0.5);
          const ua = u2 - tHit(d);
          if (ua > 0) bend += 1.25 * Math.exp(-ua * 3.2) * Math.cos(ua * 13) * (1 - 0.6 * d) + 0.1 * Math.exp(-ua * 1.5);
          E.set(0, -th + Math.PI / 2, 0, "YXZ"); Q.setFromEuler(E);
          const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend + 0.12);
          Q.multiply(q2);
          S.set(0.004 + 0.004 * R(5), h, 1);
          P.set(x, ctx.heightAt(x, z), z);
          M.compose(P, Q, S); blades.setMatrixAt(i, M);
        }
        blades.instanceMatrix.needsUpdate = true;
        // ---- ring + wall
        const R = Rt(u);
        const life = u > 0 ? 1 - smooth((u - 0.25) / 0.9) : 0;
        ring.position.set(C.x, gy + 0.004, C.z); ring.scale.set(Math.max(R, 1e-3), 1, Math.max(R, 1e-3));
        ring.material.uniforms.uA.value = life; ring.material.uniforms.uW.value = THREE.MathUtils.clamp(0.06 / Math.max(R, 0.05) + 0.12, 0.12, 0.6);
        wall.position.set(C.x, gy, C.z); wall.scale.set(Math.max(R * 0.985, 1e-3), 0.025 + 0.05 * Math.min(1, R), Math.max(R * 0.985, 1e-3));
        wall.material.uniforms.uA.value = 0.35 * life;
        // ---- flare at the contact
        if (u2 >= 0 && u2 < 0.7) {
          const k = Math.exp(-u2 * 5), p = C.clone(); p.y += 0.01;
          flare.add(p, null, 0.5 * (0.6 + 0.4 * k), 0, hot, 0.55 * k, 1);
          flare.add(p, null, 0.08, 0, "#FFFFFF", 0.9 * k, 1);
          for (let s = 0; s < 6; s++) {
            const a = s * Math.PI / 3 + 0.26, len = (s % 3 === 0 ? 0.9 : 0.35) * (0.5 + 0.5 * k) * (s === 0 || s === 3 ? 1.6 : 1);
            const dirv = new THREE.Vector3().copy(ctx.camera.up).multiplyScalar(Math.sin(a)).addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion), Math.cos(a));
            flare.add(p.clone().addScaledVector(dirv, len / 2), dirv.clone().multiplyScalar(len), 0.006, 2.5, s === 0 || s === 3 ? "#FFE9D2" : hot, 0.8 * k, 1, 0, 0, 0.2);
          }
          if (u2 < 0.25) flare.add(p, null, 0.035, 0, ORANGE, 0.6 * (1 - u2 / 0.25), 1);
        }
        // ---- dust puffs along the ring, specks flung out
        for (let i = 0; i < 80 && u2 > 0; i++) {
          const Rr = (k) => h1(i, k, 91);
          const d = 0.08 + 1.1 * Math.pow(Rr(1), 0.8), th = Rr(2) * Math.PI * 2, a = u2 - tHit(d);
          if (a < 0) continue;
          const dd = d + 0.12 * (1 - Math.exp(-a * 4));
          const x = C.x + Math.cos(th) * dd, z = C.z + Math.sin(th) * dd;
          const dcam = Math.hypot(x - cam.x, z - cam.z); if (dcam < 0.2) continue;
          const r = Math.min(0.012 + 0.025 * Rr(3), dcam * 0.12) * (0.5 + d) * (1 - Math.exp(-a * 8)) * (1 - smooth((a - 0.2) / (0.4 + 0.3 * Rr(4))));
          dust.add([x, ctx.heightAt(x, z) + r * 0.6 + 0.03 * a, z], r, dustCol, Rr(5) * 6 + a);
        }
        for (let i = 0; i < 160 && u2 > 0; i++) {
          const Rr = (k) => h1(i, k, 93);
          const d0 = 0.05 + 0.6 * Rr(1), th = Rr(2) * Math.PI * 2, a = u2 - tHit(d0); if (a < 0 || a > 1.1) continue;
          const v = 0.6 + 1.2 * Rr(3), vy = 0.4 + 0.8 * Rr(4);
          const x = C.x + Math.cos(th) * (d0 + v * a), z = C.z + Math.sin(th) * (d0 + v * a), y = ctx.heightAt(x, z) + Math.max(0, vy * a - 2 * a * a) + 0.005;
          specks.add([x, y, z], [Math.cos(th) * v * 0.03, (vy - 4 * a) * 0.03, Math.sin(th) * v * 0.03], 0.003, 1.2, i % 4 ? dustCol : hot, 1 - smooth((a - 0.6) / 0.5), 0, 0, 0, 0.4);
        }
        flare.end(); specks.end(); dust.end();
      },
      dispose() { for (const m of [ring, wall, blades]) { m.geometry.dispose(); m.material.dispose(); } flare.dispose(); specks.dispose(); dust.dispose(); },
    };
  },
};
