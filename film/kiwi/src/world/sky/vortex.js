// The indigo spiral vortex (S12): a sky dome whose shader maps each view direction to log-polar coordinates around
// the sun (u = angle around the sun, v = ln of the angular distance). In that space a logarithmic spiral is a straight
// line, so the arms are PAINTED as slanted brush clumps on a canvas (data channels: R = lit, G = density,
// B = colour variation), brushed by the core Kuwahara pass, then swirled (differential rotation, accelerating) and
// drained inward (a shift along ln r) in the shader. Clouds thin and the eye opens as the storm drains.
import * as THREE from "three";
import { rng, clamp } from "../../core/time.js";
import { tileTexture } from "./terrain.js";

export const LNMIN = -4.4, LNMAX = 0.75, DL = LNMAX - LNMIN;
const W = 3584, H = Math.round((W * DL) / (2 * Math.PI) / 1.2);   // ~conformal (slightly stretched along the flow)

/** Paint the data texture. */
export function vortexTexture(ctx) {
  return tileTexture(ctx, W, H, (g, w, h, wrap) => {
    const r = rng(2024);
    g.fillStyle = "#000000"; g.fillRect(-30, -30, w + 60, h + 60);
    const yOf = (ln) => ((ln - LNMIN) / DL) * h;
    const slope = 3.1;                      // canvas dx per dy along an arm (log spiral, trailing)
    const ang = Math.atan2(1, -slope);      // arm direction in canvas
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // one cloud clump in data colours: dens = peak density (0..1), lit = how sun-lit its top is, varc = 0..255
    const clump = (x, y, rx, ry, dens, lit, varc, seed) => {
      const rr = rng(seed);
      const pts = 14, shape = Array.from({ length: pts + 1 }, () => 1 + (rr() - 0.5) * 0.35);
      const ell = (cx, cy, kx, ky, R, G) => {
        g.fillStyle = `rgb(${Math.round(R * 255)},${Math.round(G * 255)},${varc})`; g.beginPath();
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2, k = shape[i % pts];
          const lx = Math.cos(a) * rx * kx * k, ly = Math.sin(a) * ry * ky * k;
          const px = cx + lx * ca - ly * sa, py = cy + lx * sa + ly * ca; i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fill();
      };
      wrap(x, y, rx * 1.3, (X, Y) => {
        // the sun is "up" on the canvas (smaller ln r): lit side on top
        ell(X, Y, 1, 1, 0.12 * lit, 0.5 * dens);
        ell(X - sa * ry * -0.12, Y - ry * 0.16, 0.82, 0.72, 0.45 * lit + 0.05, 0.75 * dens);
        ell(X - sa * ry * -0.2, Y - ry * 0.32, 0.6, 0.42, 0.85 * lit + 0.1, 0.95 * dens);
        ell(X - sa * ry * -0.25, Y - ry * 0.5, 0.42, 0.2, lit, 0.8 * dens);
      });
    };
    // streak: a long thin wisp along the flow
    const streak = (x, y, len, wid, dens, lit, varc) => {
      wrap(x, y, len, (X, Y) => {
        g.save(); g.translate(X, Y); g.rotate(ang + r.gauss() * 0.03);
        g.fillStyle = `rgb(${Math.round(lit * 255)},${Math.round(dens * 255)},${varc})`;
        g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid * 0.6, -len / 2, 0); g.fill(); g.restore();
      });
    };
    const ARMS = 6;
    // 1) outer storm shelf: heavy, dark, lumpy (large ln r)
    for (let i = 0; i < 700; i++) {
      const y = yOf(r.range(-1.1, LNMAX + 0.05)), x = r() * w, k = clamp((y / h - 0.45) / 0.55);
      const s = h * r.range(0.012, 0.032) * (0.6 + 0.8 * k);
      if (r() > 0.2 + 0.55 * k) continue;
      clump(x, y, s * r.range(2.2, 3.6), s, r.range(0.6, 0.95), r.range(0.2, 0.6), Math.floor(r() * 255), i + 7);
    }
    // 2) spiral arms: clumps along trailing log spirals, thicker and lumpier outward
    for (let a = 0; a < ARMS; a++) {
      const phase = (a + r.range(-0.2, 0.2)) / ARMS * w, strength = r.range(0.7, 1.1);
      for (let y = yOf(-3.6); y < h + 20; y += r.range(5, 12)) {
        const k = y / h, x0 = phase - slope * y;
        const width = h * (0.025 + 0.07 * k) * strength;
        const n = 1 + Math.floor(k * 2.5);
        for (let j = 0; j < n; j++) {
          const off = r.gauss() * width * 0.45, x = x0 + off * -sa / Math.max(0.2, Math.abs(ca)) * 0.3 + r.gauss() * width * 0.4, yy = y + off;
          const s = h * r.range(0.006, 0.02) * (0.5 + 2.2 * k);
          const lit = clamp(1.05 - k * 0.8 + r.range(-0.15, 0.15));
          clump(((x % w) + w) % w, yy, s * r.range(1.8, 3.4), s, r.range(0.65, 1) * (0.75 + 0.25 * strength), lit, Math.floor(r() * 255), a * 10007 + Math.floor(y * 7) + j);
        }
      }
    }
    // 3) secondary arms: thinner bands of wisps between the main arms
    for (let a = 0; a < ARMS; a++) {
      const phase = (a + 0.5 + r.range(-0.15, 0.15)) / ARMS * w;
      for (let y = yOf(-3.0); y < h; y += r.range(10, 22)) {
        const k = y / h, x = phase - slope * y + r.gauss() * h * 0.02;
        streak(((x % w) + w) % w, y + r.gauss() * 6, h * r.range(0.05, 0.14) * (0.5 + k), h * r.range(0.004, 0.012) * (0.6 + k), r.range(0.35, 0.6), clamp(1 - k * 0.7), Math.floor(r() * 255));
      }
    }
    // 4) inner eye: thin bright wisps winding tight around the sun
    for (let i = 0; i < 520; i++) {
      const y = yOf(r.range(-4.2, -1.6)), x = r() * w, k = y / h;
      streak(x, y, h * r.range(0.04, 0.12), h * r.range(0.003, 0.008), r.range(0.3, 0.7) * (0.4 + k * 2), r.range(0.8, 1), Math.floor(r() * 255));
    }
    // 5) fine flow strokes over everything (gives the brushed, streaming texture)
    for (let i = 0; i < 2600; i++) {
      const y = r() * h, x = r() * w, k = y / h;
      streak(x, y, h * r.range(0.02, 0.06), h * r.range(0.002, 0.005) * (0.5 + k), r.range(0.2, 0.5), r.range(0.3, 1) * (1 - k * 0.5), Math.floor(r() * 255));
    }
  }, { r: 2, paper: 0.0 }, { m: 40, aniso: 8 });
}

const vert = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const frag = /* glsl */ `
precision highp float;
uniform sampler2D tVort; uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uE1; uniform vec3 uE2;
uniform float uK; uniform float uRot; uniform float uDrain; uniform float uEye; uniform float uThin; uniform float uGlow; uniform float uT;
uniform float uFlash; uniform vec3 uFlashColor;
uniform vec2 uTexW; // (margin fraction, content fraction) horizontally
varying vec3 vW;
const float LNMIN = ${LNMIN.toFixed(4)}; const float DL = ${DL.toFixed(4)};
vec3 ramp5(float x, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec4 k){
  if (x < k.x) return mix(a, b, smoothstep(0.0, k.x, x));
  if (x < k.y) return mix(b, c, smoothstep(k.x, k.y, x));
  if (x < k.z) return mix(c, d, smoothstep(k.y, k.z, x));
  return mix(d, e, smoothstep(k.z, k.w, x));
}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vW - uCam);
  float cs = clamp(dot(d, uSun), -1.0, 1.0);
  float r = acos(cs);                                   // angular distance from the sun (rad)
  vec2 q = vec2(dot(d, uE1), dot(d, uE2));
  float phi = atan(q.y, q.x);
  float phi2 = atan(-q.y, -q.x);
  float el = asin(clamp(d.y, -1.0, 1.0));
  // ---- swirl + drain in log-polar space
  float lr = log(max(r, 0.004));
  float spin = uRot * (0.55 / (r + 0.18) + 0.12);       // differential rotation: the core spins faster
  float u = phi / 6.2831853 + spin;
  float v = (lr - LNMIN + uDrain) / DL;
  // continuous derivatives across the atan seam
  vec2 dpx = vec2(dFdx(phi), dFdy(phi)), dpx2 = vec2(dFdx(phi2), dFdy(phi2));
  vec2 dphi = dot(dpx, dpx) < dot(dpx2, dpx2) ? dpx : dpx2;
  vec2 dsp = vec2(dFdx(spin), dFdy(spin));
  vec2 dv = vec2(dFdx(v), dFdy(v));
  vec2 du = dphi / 6.2831853 + dsp;
  vec2 uv = vec2(uTexW.x + fract(u) * uTexW.y, 1.0 - clamp(v, 0.0, 1.0));   // canvas top (small r) = uv.y 1
  float soft = 1.0 + 2.2 * smoothstep(0.25, 0.9, r);   // softer, cumulus-like edges where the texture is magnified
  vec4 T = textureGrad(tVort, uv, vec2(du.x * uTexW.y, -dv.x) * soft, vec2(du.y * uTexW.y, -dv.y) * soft);
  float lit = T.r, dens = T.g, var_ = T.b;
  // ---- sky behind the clouds (warm core -> rose -> violet -> indigo), the glow spreads as the storm drains
  float rg = r / (1.0 + uGlow * 0.55);
  vec3 sky = ramp5(rg, vec3(0.98, 0.86, 0.66), vec3(0.93, 0.66, 0.5), vec3(0.72, 0.42, 0.58), vec3(0.3, 0.22, 0.6), vec3(0.08, 0.07, 0.27), vec4(0.06, 0.17, 0.4, 1.0));
  sky = mix(sky, sky * vec3(0.92, 0.9, 1.08), smoothstep(0.1, 0.7, el));
  // ---- clouds
  float eye = smoothstep(uEye * 0.55, uEye * 1.35, r);
  float cover = smoothstep(0.12 + uThin * 0.25, 0.42 + uThin * 0.25, dens) * eye * smoothstep(-0.02, 0.06, v) * (1.0 - uThin * smoothstep(0.9, 0.2, r) * 0.95);
  vec3 litC = ramp5(r, vec3(1.0, 0.9, 0.72), vec3(0.98, 0.74, 0.6), vec3(0.82, 0.55, 0.7), vec3(0.5, 0.44, 0.82), vec3(0.28, 0.26, 0.62), vec4(0.06, 0.2, 0.45, 0.95));
  vec3 shC = ramp5(r, vec3(0.7, 0.48, 0.6), vec3(0.45, 0.3, 0.58), vec3(0.24, 0.18, 0.5), vec3(0.13, 0.11, 0.38), vec3(0.05, 0.05, 0.19), vec4(0.08, 0.22, 0.45, 0.95));
  vec3 tint = mix(vec3(0.92, 0.95, 1.1), vec3(1.08, 0.97, 0.92), var_);
  float l = pow(lit, 1.15) * (0.85 + 0.35 * uGlow);
  vec3 cloud = mix(shC, litC, clamp(l, 0.0, 1.0)) * tint;
  // silver lining: thin dense edges toward the sun glow brightly
  float edge = smoothstep(0.25, 0.45, dens) * (1.0 - smoothstep(0.5, 0.8, dens)) * smoothstep(0.5, 0.95, lit);
  cloud += vec3(1.0, 0.85, 0.65) * edge * 0.35 * smoothstep(0.7, 0.05, r);
  vec3 col = mix(sky, cloud, cover);
  // ---- god rays through the gaps
  float rays = 0.5 + 0.5 * sin(phi * 37.0 + sin(phi * 11.0) * 2.0) * sin(phi * 23.0 - 1.3);
  rays = smoothstep(0.55, 0.95, rays) * (1.0 - cover) * smoothstep(0.8, 0.06, r) * smoothstep(0.02, 0.08, r);
  col += vec3(1.0, 0.82, 0.6) * rays * 0.12 * (0.4 + uGlow);
  // ---- the sun: disc + bloom-ready core + wide glow
  float disc = smoothstep(0.0115, 0.0095, r);
  col = mix(col, vec3(1.25, 1.18, 1.05), disc);
  col += vec3(1.0, 0.8, 0.55) * exp(-r * r / (0.0006 + 0.0012 * uGlow)) * (0.45 + 0.35 * uGlow) * (1.0 - 0.6 * cover);
  col += vec3(0.85, 0.5, 0.42) * exp(-r / (0.07 + 0.06 * uGlow)) * 0.12 * uGlow;
  // ---- horizon haze, below-horizon fade to the fog colour
  col = mix(col, vec3(0.55, 0.42, 0.75), smoothstep(0.12, -0.02, el) * 0.35);
  col = mix(col, uFlashColor, uFlash * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * The dome. sunDir: world direction of the sun (vortex centre). Returns {mesh, update(t, t2, ctx), dispose}.
 * timing: {t0, t1} of the drain. on twos for the cloud motion (hand-drawn FX feel).
 */
export function vortexDome(ctx, { sunDir, t0, t1, radius = 3000, center = [0, 0, 0] }) {
  const tex = vortexTexture(ctx);
  const S = new THREE.Vector3(...sunDir).normalize();
  const E1 = new THREE.Vector3().crossVectors(S, new THREE.Vector3(0, 1, 0)).normalize();   // horizontal (right)
  const E2 = new THREE.Vector3().crossVectors(E1, S).normalize();                           // up
    const mat = new THREE.ShaderMaterial({
    uniforms: {
      tVort: { value: tex.texture }, uCam: { value: new THREE.Vector3() }, uSun: { value: S }, uE1: { value: E1 }, uE2: { value: E2 },
      uK: { value: 0 }, uRot: { value: 0 }, uDrain: { value: 0 }, uEye: { value: 0.05 }, uThin: { value: 0.1 }, uGlow: { value: 0 }, uT: { value: 0 },
      uTexW: { value: new THREE.Vector2() },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color("#EAF2FF") },
    },
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false,
  });
  mat.uniforms.uTexW.value.set(0, 1);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  mesh.position.set(...center); mesh.name = "vortex"; mesh.renderOrder = -10000; mesh.frustumCulled = false;
  const state = (tt) => {
    const k = clamp((tt - t0) / (t1 - t0));
    // accelerating swirl: angle grows ~k^1.8; the drain pulls clouds inward faster at the end
    return { k, rot: -(0.12 * k + 0.5 * Math.pow(k, 2.2)), drain: 0.08 * k + 0.55 * Math.pow(k, 2.0), eye: 0.04 + 0.2 * Math.pow(k, 1.6), thin: 0.72 * Math.pow(k, 1.7), glow: 0.15 + 0.85 * Math.pow(k, 1.4) };
  };
  return {
    mesh, state,
    update(t, t2, c) {
      const s = state(t2); const U = mat.uniforms;
      U.uCam.value.copy(c.camera.position); U.uK.value = s.k; U.uRot.value = s.rot; U.uDrain.value = s.drain; U.uEye.value = s.eye; U.uThin.value = s.thin; U.uGlow.value = s.glow; U.uT.value = t2;
    },
    dispose: tex.dispose,
  };
}
