// FX shared helpers (FX department). Everything here is a pure function of the arguments: no state between frames.
//  - Sprites: instanced screen-facing quads / streaks / drops / blades with crisp anime edges (CPU-filled each frame)
//  - Puffs:   instanced cel-shaded lumpy spheres (smoke, dust, foam, powder snow) that take ink lines
//  - helpers: kiwi path from the shot's walk acts, screen size, light direction in screen space
import * as THREE from "three";
import { RIG_U } from "../core/cel.js";

export const FPS = 24;
export const ORANGE = "#FF6B12";
const V3 = () => new THREE.Vector3();

/** Drawing-buffer size in px (Vector2). */
export function screen(ctx) { const v = new THREE.Vector2(); ctx.renderer.getDrawingBufferSize(v); return v; }

/** Kiwi root (x, z) at time t from the shot's walk acts (linear, like the walk itself). */
export function kiwiXZ(shot, t) {
  const k = shot?.kiwi; if (!k) return [0, 0];
  let x = k.at?.[0] ?? 0, z = k.at?.[1] ?? 0;
  for (const a of k.acts ?? []) if (a.do === "walk") {
    if (t >= a.t0) { const f = Math.min(1, Math.max(0, (t - a.t0) / (a.t1 - a.t0))); x = a.from[0] + (a.to[0] - a.from[0]) * f; z = a.from[1] + (a.to[1] - a.from[1]) * f; }
    else { x = a.from[0]; z = a.from[1]; break; }
  }
  return [x, z];
}
/** Walk velocity (m/s, [vx, vz]) at time t (0 when not walking). */
export function kiwiVel(shot, t) {
  for (const a of shot?.kiwi?.acts ?? []) if (a.do === "walk" && t >= a.t0 && t < a.t1) return [(a.to[0] - a.from[0]) / (a.t1 - a.t0), (a.to[1] - a.from[1]) / (a.t1 - a.t0)];
  return [0, 0];
}
/** Kiwi anchor if a kiwi exists, else a fallback point. */
export function anchor(ctx, name, fallback = [0, 0.3, 0]) {
  const p = ctx.kiwi?.anchor?.(name);
  return p ? p.clone() : new THREE.Vector3(...fallback);
}

/** Camera basis for this frame: position, forward, right, up (world). */
export function camBasis(cam) {
  cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements;
  return { pos: new THREE.Vector3(e[12], e[13], e[14]), right: new THREE.Vector3(e[0], e[1], e[2]).normalize(), up: new THREE.Vector3(e[4], e[5], e[6]).normalize(), fwd: new THREE.Vector3(-e[8], -e[9], -e[10]).normalize() };
}

/** The rig's key light as a 2D screen direction (for the light/shadow split of flat FX). */
export function keyDir2D(ctx) {
  const d = new THREE.Vector3(...ctx.rig.key.from).normalize().transformDirection(ctx.camera.matrixWorldInverse);
  const v = new THREE.Vector2(d.x, d.y); if (v.lengthSq() < 1e-4) v.set(0.3, 1); return v.normalize();
}

export const col = (c) => new THREE.Color(c);
export const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);

// ------------------------------------------------------------------------------------------------- sprites
const spriteVert = /* glsl */ `
attribute vec3 iPos; attribute vec3 iVel; attribute vec2 iSize; attribute vec4 iCol; attribute vec4 iMisc;
uniform vec2 uRes; uniform float uFogNear; uniform float uFogFar;
varying vec2 vP; varying float vLen; varying float vR; varying vec4 vCol; varying vec4 vMisc; varying float vFog; varying vec2 vDir;
void main(){
  vec4 mvA = modelViewMatrix * vec4(iPos, 1.0);
  vec4 mvB = modelViewMatrix * vec4(iPos - iVel, 1.0);
  float nearZ = -0.025;
  if (mvA.z > nearZ || iCol.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (mvB.z > nearZ) { float k = (mvA.z - nearZ) / (mvA.z - mvB.z); mvB = mix(mvA, mvB, k); }
  vec4 a = projectionMatrix * mvA, b = projectionMatrix * mvB;
  vec2 sa = a.xy / a.w * uRes * 0.5, sb = b.xy / b.w * uRes * 0.5;
  float rpx = max(iSize.x * projectionMatrix[1][1] / a.w * uRes.y * 0.5, iSize.y) * 0.5;
  vec2 d = sa - sb; float L = sqrt(dot(d, d) + 1e-6);
  float rot = iMisc.y;
  float useV = step(0.05, L);
  vec2 dir = mix(vec2(cos(rot), sin(rot)), d / max(L, 1e-3), useV);
  L *= useV;
  vec2 nrm = vec2(-dir.y, dir.x);
  float pad = rpx * max(1.0, iMisc.w) + 1.5;
  float along = mix(-pad, L + pad, position.y);
  float across = position.x * pad;
  vec2 sp = sb + dir * along + nrm * across;
  vP = vec2(along, across); vLen = L; vR = rpx; vCol = iCol; vMisc = iMisc; vDir = dir;
  vFog = smoothstep(uFogNear, uFogFar, -mvA.z);
  gl_Position = vec4(sp / (uRes * 0.5) * a.w, a.z, a.w);
}`;
const spriteFrag = /* glsl */ `
uniform float uFlash; uniform vec3 uFlashColor; uniform float uFlashMul; uniform vec3 uFogColor; uniform float uFogMul;
uniform vec2 uLight; uniform float uAlphaMul; uniform float uPremul;
varying vec2 vP; varying float vLen; varying float vR; varying vec4 vCol; varying vec4 vMisc; varying float vFog; varying vec2 vDir;
void main(){
  float shape = vMisc.x, shade = vMisc.z, taper = vMisc.w;
  float s = vLen > 0.0 ? clamp(vP.x / vLen, 0.0, 1.0) : 1.0;
  float rr = vR * mix(taper, 1.0, s);
  vec2 q = vec2(vP.x - clamp(vP.x, 0.0, vLen), vP.y);
  float dist = sqrt(dot(q, q) + 1e-6);
  vec3 c = vCol.rgb; float a = 1.0;
  if (shape < 0.5) {                       // 0: crisp capsule / speck / streak (tail tapers)
    a = clamp(rr - dist + 0.5, 0.0, 1.0) * min(1.0, rr * 1.6 + 0.2);
  } else if (shape < 1.5) {                // 1: soft glow
    float u = dist / max(rr, 0.5); a = exp(-u * u * 3.0) * (1.0 - smoothstep(0.85, 1.0, u));
  } else if (shape < 2.5) {                // 2: bokeh disc: soft edge, brighter rim, faint core
    float u = dist / max(rr, 0.5); a = (1.0 - smoothstep(0.86, 1.0, u)) * (0.45 + 0.55 * smoothstep(0.55, 0.95, u));
  } else if (shape < 3.5) {                // 3: two-tone disc / drop (cel split along the light), highlight dot
    a = clamp(rr - dist + 0.5, 0.0, 1.0);
    vec2 qq = (vDir * q.x + vec2(-vDir.y, vDir.x) * q.y) / max(rr, 0.5);
    float lit = dot(qq, uLight);
    c *= mix(1.0 - shade, 1.0, step(-0.15, lit));
    vec2 hq = qq - uLight * 0.45; float hl = 1.0 - smoothstep(0.18, 0.3, sqrt(dot(hq, hq) + 1e-6));
    c = mix(c, vec3(1.0), hl * shade * 1.2);
  } else if (shape < 4.5) {                // 4: blade / leaf: a lens along its length (vel = blade vector)
    float u = clamp(vP.x / max(vLen, 1.0), 0.0, 1.0);
    float hw = max(rr * sin(3.14159 * pow(u, 0.8)), 0.0);
    a = clamp(hw - abs(vP.y) + 0.5, 0.0, 1.0) * step(0.0, vP.x) * step(vP.x, vLen);
    c *= mix(1.0 - shade, 1.0, step(0.0, vP.y * sign(uLight.y + 0.001)));
  } else if (shape < 5.5) {                // 5: ring (shockwave puffs, splash crowns)
    float u = dist / max(rr, 0.5); a = smoothstep(0.62, 0.72, u) * (1.0 - smoothstep(0.9, 1.0, u));
  } else if (shape < 6.5) {                // 6: hard disc with ink rim (debris, grit)
    a = clamp(rr - dist + 0.5, 0.0, 1.0);
    c = mix(c, vec3(0.03, 0.03, 0.05), smoothstep(rr - 1.6, rr - 0.6, dist));
  } else {                                 // 7: trail triangle (point up), hot core = shade
    vec2 p = vP / max(rr, 0.5); const float k = 1.7320508;
    p.x = abs(p.x) - 1.0; p.y = p.y + 1.0 / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0, 0.0);
    float sd = -sqrt(dot(p, p) + 1e-6) * sign(p.y);
    a = clamp(-sd * rr + 0.5, 0.0, 1.0);
    c = mix(c, vec3(1.0, 0.95, 0.85), smoothstep(-0.12, -0.45, sd) * shade);
  }
  c = mix(c, uFogColor, vFog * uFogMul);
  c = mix(c, uFlashColor, uFlash * uFlashMul);
  a *= vCol.a * uAlphaMul;
  if (a < 0.003) discard;
  gl_FragColor = uPremul > 0.5 ? vec4(c * a, a) : vec4(c, a);
}`;

/**
 * A batch of screen-facing sprites. Each frame: begin(), add(...) per sprite, end().
 * add(p, v, w, minPx, color, alpha, shape, rot, shade, taper):
 *   p = head position (world), v = world vector from tail to head (streak; [0,0,0] for a dot),
 *   w = width in metres, minPx = minimum width in px, shape 0 capsule, 1 glow, 2 bokeh, 3 two-tone drop, 4 blade,
 *   5 ring, 6 inked disc. taper = tail width fraction (0..1). blend: "normal" | "add" | "max" (lighten, no seams).
 */
export class Sprites {
  constructor(ctx, { max = 1000, blend = "normal", depthTest = true, renderOrder = 0, flash = 0.4, fog = 1, name = "sprites" } = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = A(3); this.aVel = A(3); this.aSize = A(2); this.aCol = A(4); this.aMisc = A(4);
    g.setAttribute("iPos", this.aPos); g.setAttribute("iVel", this.aVel); g.setAttribute("iSize", this.aSize); g.setAttribute("iCol", this.aCol); g.setAttribute("iMisc", this.aMisc);
    g.instanceCount = 0;
    this.max = max; this.n = 0; this.ctx = ctx;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uRes: { value: new THREE.Vector2(1920, 1080) }, uFogNear: { value: ctx.rig.fog.near }, uFogFar: { value: ctx.rig.fog.far },
        uFogColor: { value: new THREE.Color(ctx.rig.fog.color) }, uFogMul: { value: fog },
        uFlash: RIG_U.uFlash, uFlashColor: RIG_U.uFlashColor, uFlashMul: { value: flash },
        uLight: { value: new THREE.Vector2(0.3, 1).normalize() }, uAlphaMul: { value: 1 }, uPremul: { value: blend === "max" ? 1 : 0 },
      },
      vertexShader: spriteVert, fragmentShader: spriteFrag, transparent: true, depthWrite: false, depthTest, side: THREE.DoubleSide,
      blending: blend === "add" ? THREE.AdditiveBlending : blend === "max" ? THREE.CustomBlending : THREE.NormalBlending,
    });
    if (blend === "max") { this.mat.blendEquation = THREE.MaxEquation; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.mesh.name = name;
    this.geo = g; this._c = new THREE.Color();
  }
  begin(ctx = this.ctx) { this.n = 0; this.mat.uniforms.uRes.value.copy(screen(ctx)); this.mat.uniforms.uLight.value.copy(keyDir2D(ctx)); }
  add(p, v, w, minPx, color, alpha = 1, shape = 0, rot = 0, shade = 0, taper = 1) {
    if (this.n >= this.max || alpha <= 0.002) return;
    const i = this.n++;
    this.aPos.array.set([p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]], i * 3);
    this.aVel.array.set(v ? [v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]] : [0, 0, 0], i * 3);
    this.aSize.array[i * 2] = w; this.aSize.array[i * 2 + 1] = minPx;
    const c = color.isColor ? color : this._c.set(color);
    this.aCol.array[i * 4] = c.r; this.aCol.array[i * 4 + 1] = c.g; this.aCol.array[i * 4 + 2] = c.b; this.aCol.array[i * 4 + 3] = alpha;
    this.aMisc.array[i * 4] = shape; this.aMisc.array[i * 4 + 1] = rot; this.aMisc.array[i * 4 + 2] = shade; this.aMisc.array[i * 4 + 3] = taper;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aVel, this.aSize, this.aCol, this.aMisc]) { a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, this.n * a.itemSize); }
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------------------------------------- puffs
const puffVert = /* glsl */ `
#include <common>
varying vec3 vNv; varying vec3 vPv; varying vec3 vCol; varying vec3 vObj;
void main(){
  vec3 n = normal; vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vObj = position;
  vec4 mv = modelViewMatrix * p;
  vNv = normalize(normalMatrix * n); vPv = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const puffFrag = /* glsl */ `
uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform vec3 uShade; uniform vec3 uRimDir; uniform vec3 uRimColor; uniform float uRimPower;
uniform float uAmbient; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uFlash; uniform vec3 uFlashColor;
uniform float uThresh; uniform float uShadeMul; uniform float uHi; uniform float uFogMul; uniform float uRimMul; uniform vec3 uEmissive; uniform float uFlashMul;
varying vec3 vNv; varying vec3 vPv; varying vec3 vCol; varying vec3 vObj;
void main(){
  vec3 n = normalize(vNv); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vPv); vec3 L = normalize(uKeyDir);
  float ndl = dot(n, L);
  float lit = smoothstep(uThresh - 0.03, uThresh + 0.03, ndl);
  vec3 base = vCol;
  vec3 shadeCol = base * mix(vec3(1.0), uShade * 1.6, uShadeMul) * (0.55 + uAmbient);
  vec3 litCol = base * mix(vec3(1.0), uKeyColor, 0.65);
  vec3 c = mix(shadeCol, litCol, lit);
  float hi = smoothstep(0.62, 0.68, dot(n, normalize(L + v))) * uHi;
  c = mix(c, min(litCol * 1.18 + 0.05, vec3(1.0)), hi);
  float fres = 1.0 - max(dot(n, v), 0.0);
  float rim = smoothstep(0.6, 0.66, fres) * smoothstep(-0.2, 0.4, dot(n, normalize(uRimDir)));
  c = mix(c, uRimColor * max(base * 1.3, vec3(0.4)), rim * uRimPower * uRimMul);
  c += uEmissive;
  c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, length(vPv)) * uFogMul);
  c = mix(c, uFlashColor, uFlash * uFlashMul);
  gl_FragColor = vec4(c, 1.0);
}`;

/** A lumpy unit "cauliflower" sphere (pre-displaced so ink lines match). */
export function lumpySphere(seed = 1, lump = 0.16, detail = 3) {
  const g = new THREE.SphereGeometry(1, 8 * detail + 8, 6 * detail + 4);   // indexed -> smooth cel bands
  const p = g.attributes.position, v = new THREE.Vector3();
  const R = mulberry(seed);
  const bumps = Array.from({ length: 12 }, () => [new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize(), 0.25 + R() * 0.35, 0.5 + R()]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 0; for (const [c, w, a] of bumps) { const k = Math.max(0, v.dot(c) - (1 - w)) / w; d += a * k * k; }
    v.multiplyScalar(1 + lump * (d - 0.35));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function mulberry(a) { a = (a * 2654435761) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Instanced cel puffs. add(p, r, colour, rotSeed, squash=[sx,sy,sz]). Ink lines by default (inkable).
 * opts: max, thresh (light/shadow split), shade (how much rig shade tints shadows), hi, fog, rim, emissive, ink, lump.
 */
export class Puffs {
  constructor(ctx, { max = 200, thresh = 0.1, shade = 1, hi = 0.6, fog = 1, rim = 1, emissive = "#000000", ink = true, lump = 0.16, seed = 1, detail = 3, flash = 0.85, name = "puffs" } = {}) {
    this.geo = lumpySphere(seed, lump, detail);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...RIG_U, uThresh: { value: thresh }, uShadeMul: { value: shade }, uHi: { value: hi }, uFogMul: { value: fog }, uRimMul: { value: rim }, uEmissive: { value: new THREE.Color(emissive) }, uFlashMul: { value: flash } },
      vertexShader: puffVert, fragmentShader: puffFrag,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = name;
    if (ink) ctx.inkable(this.mesh);
    this.max = max; this.n = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  add(p, r, color, rot = 0, squash = null) {
    if (this.n >= this.max || r <= 1e-5) return;
    const i = this.n++;
    this._e.set(rot * 1.7, rot * 2.3, rot * 0.9); this._q.setFromEuler(this._e);
    this._s.set(r * (squash?.[0] ?? 1), r * (squash?.[1] ?? 1), r * (squash?.[2] ?? 1));
    this._p.set(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.setColorAt(i, color.isColor ? color : this._c.set(color));
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

/** Cubic bezier point. */
export function bez(a, b, c, d, u) { const v = 1 - u; return a * v * v * v + 3 * b * v * v * u + 3 * c * v * u * u + d * u * u * u; }
export const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** 0..1 window with smooth in/out: up from a to b, down from c to d. */
export const win = (t, a, b, c, d) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

/** Wrap a world-fixed point into a box of size B centred on C (so particles fill the space around a moving camera). */
export function wrap(out, base, C, B) {
  for (const k of ["x", "y", "z"]) { const b = B[k] ?? B; const v = base[k] - C[k] + b / 2; out[k] = C[k] - b / 2 + (v - b * Math.floor(v / b)); }
  return out;
}
export const backOut = (k, s = 1.70158) => { k = clamp(k) - 1; return k * k * ((s + 1) * k + s) + 1; };
/** Deterministic 0..1 hash from integers. */
export function h1(a, b = 0, c = 0) { let x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); }
/** Distance from the camera to the kiwi head (or the camera's look distance ~3 m): sizes effects to the shot. */
export function subjectDist(ctx) {
  const cb = camBasis(ctx.camera); const h = ctx.kiwi?.anchor?.("head");
  return h ? Math.max(0.08, h.distanceTo(cb.pos)) : 3;
}
