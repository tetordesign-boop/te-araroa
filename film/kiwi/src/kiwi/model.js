// The kiwi model: a North Island brown kiwi tramper. Built from parametric surfaces (cel material + painted textures +
// inverted-hull ink), plus a procedural anime eye shader. Coordinates: metres; kiwi-local +Z forward, +Y up, +X = his
// left. The part frames below are shared with the rig (main.js) and the pose maths (pose.js).
import * as THREE from "three";
import { RIG_U } from "../core/cel.js";
import { noise1, noise2, rng } from "../core/time.js";
import { Tube, gridGeo, latheGeo, profileFn, dirZ, dirY, sup, clamp, lerp, sstep, add3, sub3, mul3, norm3, cross3, dot3, resample, smoothPts } from "./util.js";

// ---------------------------------------------------------------------------------------------- part frames
export const BC = [0, 0.075, -0.035];                 // body centre (hips space)
export const SOCK = [0, 0.118, 0.083];                // neck socket (hips space)
export const HIPJ = [[0.046, -0.004, 0.006], [-0.046, -0.004, 0.006]];   // hip joints L, R (hips space)
export const ANKLE = [0, 0.05, -0.013];               // where the leg enters the boot (boot space)
export const LEG = [0.088, 0.082];                    // upper (hip->heel joint), lower (heel->ankle)
export const BEAK = [[0, -0.013, 0.036], [0, -0.03, 0.118], [0, -0.088, 0.178]];
export const BEAK_TIP = [0, -0.0895, 0.181];
export const EYE_S = 0.0152;                          // eye half-height (m)
export const BEANIE_POS = [0, 0.03, -0.008], BEANIE_RX = -0.26, BEANIE_TOP = [0, 0.097, 0];
export const PACK_POS = [0, 0.165, -0.098], PACK_RX = -0.12, PACK_C = [0, 0.16, 0];
export const BOW = [0, 0.0505, 0.0095];
export const BOOT_S = 1.2;                           // boots are drawn chunky

export function bodyShape(d) {
  const u = d[2], fr = sstep(-0.3, 1.0, u);
  let x = d[0] * 0.128 * (1 - 0.33 * fr), y = d[1] * 0.148 * (1 - 0.2 * fr), z = d[2] * (u > 0 ? 0.165 : 0.185);
  y += 0.05 * fr * fr;
  if (d[1] < 0) y -= 0.014 * (1 - u * u) * -d[1];
  return [x, y, z];
}
function bodyTuft(a, b, p) {
  const ph = 2 * Math.PI * b, rc = a * 6 + 0.35 * noise1(ph * 1.3 + 2, 5), row = Math.floor(rc), f = rc - row;
  const sp = Math.pow(0.5 + 0.5 * Math.cos(ph * (8 + row * 2) + row * 2.3 + 0.8 * noise1(ph * 4, row + 7)), 2);
  const amp = (0.002 + 0.011 * sstep(0.15, 0.95, a)) * (1 + 0.7 * Math.max(0, -p[1] / 0.15));
  return amp * Math.pow(f, 1.6) * (0.3 + 0.7 * sp);
}
export function headShape(d) {
  let x = d[0] * 0.054, y = d[1] * 0.056, z = d[2] * 0.062;
  if (d[2] > 0) { const k = d[2] * d[2]; x *= 1 - 0.22 * k; y *= 1 - 0.12 * k; }
  return [x, y, z];
}
function headTuft(a, b, p) {
  const ph = 2 * Math.PI * b, back = sstep(0.55, 0.95, a), cheek = sstep(0.45, 0.7, a) * Math.max(0, -p[1] / 0.05);
  const sp = Math.pow(0.5 + 0.5 * Math.cos(ph * 11 + noise1(ph * 3, 4)), 2);
  return (0.004 * back + 0.003 * cheek) * sp * (0.4 + 0.6 * ((a * 5) % 1));
}
/** Surface normal of a star-shaped shape fn at unit direction d (numeric). */
export function shapeNormal(fn, d) {
  const t1 = norm3(cross3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross3(d, t1), e = 1e-3;
  const n = norm3(cross3(sub3(fn(norm3(add3(d, t1, e))), fn(norm3(add3(d, t1, -e)))), sub3(fn(norm3(add3(d, t2, e))), fn(norm3(add3(d, t2, -e))))));
  return dot3(n, d) < 0 ? mul3(n, -1) : n;
}
/** Eye frames (head space): centre on the surface, outward normal N, X toward the beak, Y up. i=0 left (+X), 1 right. */
export const EYES = [1, -1].map((sx) => {
  const d = norm3([sx * 0.84, 0.24, 0.48]), C = headShape(d), N = shapeNormal(headShape, d);
  const X = norm3(sub3([0, 0, 1], mul3(N, N[2]))); let Y = norm3(cross3(N, X)); if (Y[1] < 0) Y = mul3(Y, -1);
  return { d, C, N, X, Y };
});

// ---------------------------------------------------------------------------------------------- textures (cached per page)
const TEXC = { r: null, t: null };
function textures(ctx) {
  if (TEXC.r === ctx.renderer && TEXC.t) return TEXC.t;
  const P = ctx.paint, br = { r: 2, paper: 0.04 };
  const mk = (w, h, fn, b = br) => { const t = ctx.paintTexture(w, h, fn, b); t.userData.keep = true; return t; };
  const strokesV = (g, w, h, r, n, len, wid, cols, alpha = [0.4, 0.9], spread = 0.12) => {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, L = r.range(...len), W = r.range(...wid), c = typeof cols === "function" ? cols(x, y, r) : r.pick(cols), a = Math.PI / 2 + r.gauss() * spread;
      g.globalAlpha = r.range(...alpha);
      for (const ox of [0, w, -w]) if (ox === 0 || (ox > 0 ? x < L : x > w - L)) P.stroke(g, x + ox, y, a, L, W, c, 0.75, r);
    }
    g.globalAlpha = 1;
  };
  const feathers = (g, w, h, seed, n, len, wid) => {
    const r = rng(seed); g.fillStyle = "#6A4A2C"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.2; P.blob(g, r() * w, r() * h, r.range(0.04, 0.12) * w, r.range(0.06, 0.16) * h, r.pick(["#5A3E25", "#7A5632", "#634529"]), seed + i, 0.4); }
    strokesV(g, w, h, r, n, len, wid, (x, y, rr) => (rr() < 0.06 ? "#A88454" : rr() < 0.09 ? "#45301E" : rr.pick(["#573C24", "#62442A", "#6E4E30", "#7C5937", "#8A6641"])), [0.3, 0.75]);
    // calm the UV poles (front of the chest, rump) so they do not pinch into a star
    for (const [y0, y1] of [[0, 0.16], [1, 0.84]]) { const gr = g.createLinearGradient(0, y0 * h, 0, y1 * h); gr.addColorStop(0, "rgba(104,74,44,1)"); gr.addColorStop(1, "rgba(104,74,44,0)"); g.fillStyle = gr; g.fillRect(0, Math.min(y0, y1) * h, w, Math.abs(y1 - y0) * h); }
  };
  const t = {
    body: mk(1024, 1024, (g, w, h) => feathers(g, w, h, 11, 7000, [30, 95], [5, 10]), { r: 3, paper: 0.04 }),
    head: mk(1024, 1024, (g, w, h) => feathers(g, w, h, 12, 9000, [24, 60], [5, 10]), { r: 1, paper: 0.03 }),
    leg: mk(128, 256, (g, w, h) => {
      g.fillStyle = "#A2978C"; g.fillRect(0, 0, w, h); const r = rng(13);
      for (let y = 0; y < h; y += 7) for (let x = ((y / 7) % 2) * 6 - 6; x < w + 12; x += 12) { g.strokeStyle = r() < 0.5 ? "#7C7268" : "#887D72"; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 6, 0.15, Math.PI - 0.15); g.stroke(); }
      // feathered "trousers" at the hip end (v = 0 = canvas bottom), ragged edge
      g.fillStyle = "#5E4128"; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.5 + (r() - 0.5) * 30 + ((x / 8) % 2) * 14); g.lineTo(w, h); g.closePath(); g.fill();
      strokesV(g, w, h * 0.55, r, 500, [14, 40], [3, 6], ["#4A3220", "#6B4A2E", "#7A5634"]);
      g.save(); g.translate(0, h * 0.45); strokesV(g, w, h * 0.55, r, 500, [14, 40], [3, 6], ["#4A3220", "#6B4A2E", "#7A5634"]); g.restore();
    }),
    boot: mk(256, 256, (g, w, h) => {
      const r = rng(14); g.fillStyle = "#87522E"; g.fillRect(0, 0, w, h);
      strokesV(g, w, h, r, 900, [10, 30], [3, 7], ["#7A4828", "#935D35", "#9E6A40", "#6E4024"], [0.25, 0.6], 1.2);
      g.fillStyle = "#5E3720"; g.fillRect(0, 0, w, h * 0.28); g.fillRect(0, h * 0.84, w, h * 0.16);       // toe cap, heel counter
      g.strokeStyle = "#E8D7B0"; g.lineWidth = 2; g.setLineDash([5, 4]);
      for (const y of [h * 0.3, h * 0.82]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.setLineDash([]);
    }),
    pack: mk(512, 512, (g, w, h) => {
      const r = rng(15); g.fillStyle = "#3E7268"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { const x = r() * w, y = r() * h; g.globalAlpha = r.range(0.15, 0.45); g.fillStyle = r.pick(["#47827A", "#35665E", "#4B8A80", "#30605A"]); r() < 0.5 ? g.fillRect(x, y, r.range(4, 10), 1.5) : g.fillRect(x, y, 1.5, r.range(4, 10)); }
      g.globalAlpha = 1; g.fillStyle = "#2E3C3A"; g.fillRect(0, h * 0.86, w, h * 0.14);                    // bottom panel
      g.strokeStyle = "#D8CDB2"; g.lineWidth = 2; g.setLineDash([6, 5]);
      for (const y of [h * 0.1, h * 0.85]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, h * 0.1); g.lineTo(x, h * 0.85); g.stroke(); }
      g.setLineDash([]);
    }),
    beanie: mk(512, 256, (g, w, h) => {
      const r = rng(16); g.fillStyle = "#2E4D8F"; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) { const x = (k / 40) * w; g.fillStyle = "#3A5DA4"; g.fillRect(x - 2.5, 0, 5, h); g.fillStyle = "#223B72"; g.fillRect(x + w / 80 - 1.5, 0, 3, h); }
      for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h; g.globalAlpha = r.range(0.2, 0.5); g.fillStyle = r.pick(["#456BB6", "#1F366A", "#34569A"]); g.beginPath(); g.ellipse(x, y, 1.6, 2.6, 0, 0, 6.3); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = "#1E3466"; g.fillRect(0, h * (1 - 0.27) - 3, w, 6);                  // fold line of the cuff
    }),
    pom: mk(128, 128, (g, w, h) => {
      const r = rng(17); g.fillStyle = "#FF6B12"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { g.globalAlpha = r.range(0.4, 0.9); P.stroke(g, r() * w, r() * h, r() * 6.28, r.range(6, 16), r.range(1.5, 3), r.pick(["#FF8B3D", "#E9580B", "#FF7A22", "#FFA060"]), 0.8, r); }
      g.globalAlpha = 1;
    }, { r: 1, paper: 0.02 }),
    matCap: mk(128, 128, (g, w, h) => {
      g.fillStyle = "#6E3B4E"; g.fillRect(0, 0, w, h); g.strokeStyle = "#4A2534"; g.lineWidth = 3; g.beginPath();
      for (let a = 0; a < 6 * Math.PI * 2; a += 0.1) { const rr = 4 + a * 1.55; g.lineTo(64 + rr * Math.cos(a), 64 + rr * Math.sin(a)); } g.stroke();
    }, { r: 1, paper: 0.02 }),
  };
  TEXC.r = ctx.renderer; TEXC.t = t; return t;
}

// ---------------------------------------------------------------------------------------------- the eye
const eyeVert = /* glsl */ `varying vec2 vE; varying vec3 vPv; void main(){ vE = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vPv = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const eyeFrag = /* glsl */ `
uniform float uLid, uLidL, uPupil, uGlint, uGlintRot, uHappy;
uniform vec2 uGaze;
uniform vec3 uKeyColor, uShade, uFogColor, uFlashColor, uInk;
uniform float uFogNear, uFogFar, uFlash;
varying vec2 vE; varying vec3 vPv;
float cov(float d){ float w = max(fwidth(d), 1e-4); return clamp(0.5 - d / w, 0.0, 1.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float hsh(float x){ return fract(sin(x * 91.7) * 43758.5453); }
float yUf(float x, float lid, float happy){
  float xn = clamp(x, -1.0, 1.0), arc = sqrt(max(0.0, 1.0 - xn * xn));
  float closedL = mix(-0.26 - 0.16 * arc, -0.05 + 0.22 * arc, happy);
  return mix(arc * (1.0 + 0.05 * x), closedL, lid) + 0.13 * x * lid * (1.0 - happy);
}
void main(){
  vec2 p = vE;                                   // x toward the beak, y up, unit = eye half-height
  float xn = clamp(p.x, -1.0, 1.0), arc = sqrt(max(0.0, 1.0 - xn * xn));
  float closedL = mix(-0.26 - 0.16 * arc, -0.05 + 0.22 * arc, uHappy);   // closed lid: bows down (calm) or up (happy ^)
  float yU = yUf(p.x, uLid, uHappy);
  float yLo = mix(-arc * 0.94, closedL - 0.05, uLidL);
  float dOpen = max(max(p.y - yU, yLo - p.y), abs(p.x) - 1.0);
  float inside = cov(dOpen);
  // iris, pupil, sclera
  vec2 g = uGaze, q = p - g; float ri = 0.82; float dI = length(q) - ri, tY = q.y / ri;
  vec3 col = vec3(0.95, 0.92, 0.85) * mix(1.0, 0.85, smoothstep(-0.2, 0.9, p.y));
  vec3 iris = mix(vec3(0.70, 0.40, 0.17), vec3(0.10, 0.05, 0.03), smoothstep(-0.85, 0.4, tY));
  float ang = atan(q.y, q.x); iris *= 0.86 + 0.26 * hsh(floor(ang * 8.0) + 3.0) * smoothstep(0.3, 0.8, length(q) / ri);
  float cres = smoothstep(0.42, 0.8, length(q - vec2(0.0, 0.2)) / ri) * smoothstep(-0.15, -0.7, tY);
  iris = mix(iris, vec3(0.95, 0.64, 0.30), cres * 0.6);
  // the world in the iris: a faint horizon, and the lightning when the sky flashes
  float hz = smoothstep(0.02, 0.0, abs(q.y + 0.22 - 0.05 * cos(q.x * 2.5)) - 0.015) * 0.25;
  iris = mix(iris, vec3(0.55, 0.62, 0.78), hz * (0.4 + uFlash));
  vec2 b0 = g + vec2(-0.34, 0.62), b1 = g + vec2(-0.12, 0.26), b2 = g + vec2(-0.3, 0.12), b3 = g + vec2(-0.02, -0.3), b4 = g + vec2(-0.12, -0.52);
  float bolt = min(min(sdSeg(p, b0, b1), sdSeg(p, b1, b2)), min(sdSeg(p, b2, b3), sdSeg(p, b3, b4))) - 0.03;
  iris = mix(iris, vec3(0.88, 0.93, 1.0) * 1.3, cov(bolt) * clamp(uFlash * 1.6, 0.0, 1.0));
  iris = mix(iris, vec3(0.07, 0.035, 0.025), smoothstep(-0.12, -0.02, dI));
  col = mix(col, iris, cov(dI));
  col = mix(col, vec3(0.025, 0.015, 0.012), cov(length(q * vec2(1.0, 0.95)) - 0.42 * uPupil));
  col *= mix(1.0, 0.58, smoothstep(0.4, 0.0, yU - p.y));          // shadow under the upper lid
  col *= mix(uShade * 1.07, uKeyColor, 0.72);                      // sits in the shot's light
  // highlights (unshaded): big oval upper-front (kept under the lid), small dot lower-back, the glint star
  float fl = 1.0 + 0.3 * uFlash;
  float yUh = yUf(g.x + 0.3, uLid, uHappy);
  vec2 h1 = p - vec2(g.x + 0.30, min(g.y + 0.33, yUh - 0.25)); h1 = mat2(0.83, -0.56, 0.56, 0.83) * h1;
  float hi = cov(length(h1 / vec2(0.27, 0.19) / fl) - 1.0);
  hi = max(hi, cov(length(p - (g + vec2(-0.33, -0.36))) - 0.095 * fl));
  vec2 s = p - (g + vec2(0.36, 0.42)); float cr = cos(uGlintRot), sr = sin(uGlintRot); s = mat2(cr, -sr, sr, cr) * s;
  float sz = 0.62 * uGlint; float star = pow(abs(s.x), 0.5) + pow(abs(s.y), 0.5) - pow(max(sz, 1e-4), 0.5);
  hi = max(hi, cov(star) * step(0.01, uGlint));
  vec3 hic = mix(vec3(1.0), uKeyColor, 0.12) * (1.0 + 0.4 * uFlash + 0.3 * uGlint);
  col = mix(col, hic, hi * cov(p.y - yU + 0.06));
  // ink: upper lid line of even thickness (slope-corrected), tapering flick from its back end; thin lower lid line
  float wU = (0.15 + 0.07 * smoothstep(0.5, -1.0, p.x)) * mix(1.0, 0.85, uLid);
  float xc = clamp(p.x, -0.96, 1.0);
  float yc = yUf(xc, uLid, uHappy) + wU * 0.28, sl = (yUf(xc + 0.01, uLid, uHappy) - yUf(xc - 0.01, uLid, uHappy)) / 0.02;
  float dLine = abs(p.y - yc) / sqrt(1.0 + sl * sl) - wU * 0.5;
  dLine = max(dLine, p.x - 1.03);
  if (p.x < -0.96) dLine = length(vec2(p.x + 0.96, p.y - yc)) - wU * 0.5;
  float wE = (0.15 + 0.07) * mix(1.0, 0.85, uLid);
  vec2 fa = vec2(-0.96, yUf(-0.96, uLid, uHappy) + wE * 0.28);
  vec2 fd = normalize(vec2(-0.95, 0.42 - 0.38 * uLid * (1.0 - uHappy))), fb = fa + fd * 0.3;
  float tt = clamp(dot(p - fa, fd) / 0.3, 0.0, 1.0);
  float lineU = cov(min(dLine, sdSeg(p, fa, fb) - wE * 0.5 * (1.0 - pow(tt, 0.9)) - 0.006));
  float lineL = cov(max(abs(p.y - (yLo - 0.035)) - 0.032, abs(p.x) - 0.97)) * smoothstep(0.7, 0.1, p.x) * (1.0 - uLid * 0.8);
  float lines = max(lineU, lineL);
  col = mix(col, uInk, lines);
  float alpha = max(inside, lines);
  if (alpha < 0.004) discard;
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(vPv)));
  col = mix(col, uFlashColor, uFlash * 0.4);
  gl_FragColor = vec4(col, alpha);
}`;
function eyeMaterial(ink) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uLid: { value: 0.42 }, uLidL: { value: 0 }, uPupil: { value: 1 }, uGlint: { value: 0 }, uGlintRot: { value: 0 }, uHappy: { value: 0 }, uGaze: { value: new THREE.Vector2() },
      uKeyColor: RIG_U.uKeyColor, uShade: RIG_U.uShade, uFogColor: RIG_U.uFogColor, uFogNear: RIG_U.uFogNear, uFogFar: RIG_U.uFogFar, uFlash: RIG_U.uFlash, uFlashColor: RIG_U.uFlashColor,
      uInk: { value: new THREE.Color(ink) },
    },
    vertexShader: eyeVert, fragmentShader: eyeFrag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  return m;
}

// ---------------------------------------------------------------------------------------------- build
export function buildModel(ctx) {
  const cel = ctx.celMaterial, rig = ctx.rig ?? {};
  const ink = rig.ink ?? "#1B1730";
  const OUT = ctx.outlineMaterial(0.003, ink), OUTF = ctx.outlineMaterial(0.0013, ink);
  const mesh = (geo, mat, name, { outline = 1, ink: inkOn = true } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.name = "kiwi:" + name; m.frustumCulled = false;
    if (outline) { const h = new THREE.Mesh(geo, outline === 2 ? OUTF : OUT); h.name = m.name + ":hull"; h.frustumCulled = false; m.add(h); }
    if (inkOn) ctx.inkable(m);
    return m;
  };
  const T = textures(ctx);
  const M = {
    feather: cel({ map: T.body, rim: 1, thresh: 0.0, shade: 0.9 }), head: cel({ map: T.head, rim: 1, thresh: 0.0, shade: 0.9 }),
    leg: cel({ map: T.leg, rim: 0.8, thresh: 0.0 }), beak: cel({ color: "#E8DCBC", hi: 0.45, rim: 0.9, thresh: -0.08 }), whisker: cel({ color: "#2A1C14", rim: 0 }),
    boot: cel({ map: T.boot, hi: 0.25, rim: 0.8 }), sole: cel({ color: "#2B211D", rim: 0.5 }), mid: cel({ color: "#CDBE9C", rim: 0.4 }), collar: cel({ color: "#5A3622", rim: 0.7 }),
    lace: cel({ color: "#F1E4C4", rim: 0.5, thresh: -0.2 }),
    pack: cel({ map: T.pack, rim: 1 }), packDark: cel({ color: "#2F5A52", rim: 0.9 }), web: cel({ color: "#2E2A30", rim: 0.6 }), buckle: cel({ color: "#D8CFBA", hi: 0.4, rim: 0.6 }),
    mat: cel({ color: "#6E3B4E", rim: 1 }), matCap: cel({ map: T.matCap, rim: 0.6 }), mug: cel({ color: "#ECE5D4", hi: 0.6, rim: 0.8 }), mugRim: cel({ color: "#2A3A66", rim: 0.6 }),
    metal: cel({ color: "#A7B1B8", hi: 0.7, rim: 0.8 }), cap: cel({ color: "#2A3A66", rim: 0.6 }),
    beanie: cel({ map: T.beanie, rim: 1, thresh: 0.0 }), pom: cel({ map: T.pom, rim: 0.9, thresh: -0.15 }), snow: cel({ color: "#EEF4FF", rim: 0.7, thresh: -0.3 }),
  };
  const P = {};   // parts
  const top = new THREE.Group(); top.name = "kiwi";
  const rootG = new THREE.Group(); rootG.name = "kiwi-root"; top.add(rootG);
  const leanG = new THREE.Group(); rootG.add(leanG);
  const worldG = new THREE.Group(); worldG.name = "kiwi-world"; top.add(worldG);
  const hips = new THREE.Group(); leanG.add(hips);
  const bodyS = new THREE.Group(); bodyS.position.set(...BC); hips.add(bodyS);
  P.top = top; P.rootG = rootG; P.leanG = leanG; P.worldG = worldG; P.hips = hips; P.bodyS = bodyS; P.OUT = OUT; P.OUTF = OUTF; P.M = M;

  // body
  P.body = mesh(gridGeo(56, 120, (a, b) => bodyShape(dirZ(a, b)), { disp: bodyTuft }), M.feather, "body");
  bodyS.add(P.body);
  // shoulder straps + sternum strap, lying on the body surface
  const surf = (d, off = 0.007) => { const n = norm3(d), p = bodyShape(n), N = shapeNormal(bodyShape, n); return { p: add3(p, N, off), N }; };
  const strapPath = (pts) => { const S = pts.map((d) => (d.length === 4 ? { p: d.slice(0, 3), N: [0, 1, 0] } : surf(d))); const raw = resample(S.map((s) => s.p), 24), sm = smoothPts(raw, 3); const ups = sm.map((p) => { let best = S[0]; for (const s of S) if (Math.hypot(...sub3(s.p, p)) < Math.hypot(...sub3(best.p, p))) best = s; return best.N; }); return { P: sm, ups }; };
  for (const sx of [1, -1]) {
    const path = strapPath([[sx * 0.06, 0.13, -0.03, 1], [sx * 0.45, 0.86, 0.25], [sx * 0.45, 0.74, 0.5], [sx * 0.62, 0.2, 0.76], [sx * 0.55, -0.45, 0.7], [sx * 0.8, -0.55, 0.05], [sx * 0.86, -0.1, -0.45]]);
    const tb = new Tube(24, { radial: 8, capA: 1, capB: 1 }).set(path.P, path.P.map(() => 0.0068), { ups: path.ups, flat: 0.3 });
    bodyS.add(mesh(tb.geometry, M.web, "strap" + sx, { outline: 2 }));
  }
  { const path = strapPath([[0.5, 0.18, 0.85], [0, 0.22, 1], [-0.5, 0.18, 0.85]]); const tb = new Tube(24, { radial: 8, capA: 1, capB: 1 }).set(path.P, path.P.map(() => 0.005), { ups: path.ups, flat: 0.3 });
    bodyS.add(mesh(tb.geometry, M.web, "sternum", { outline: 2 }));
    const bk = mesh(new THREE.BoxGeometry(0.016, 0.012, 0.006), M.buckle, "sternum-buckle", { outline: 2 }); const s = surf([0, 0.22, 1], 0.01); bk.position.set(...s.p); bk.lookAt(...add3(s.p, s.N)); bodyS.add(bk); }

  // neck (dynamic tube, leanG space)
  P.neck = new Tube(7, { radial: 16, capA: 2, capB: 2 }); P.neckMesh = mesh(P.neck.geometry, M.feather, "neck"); leanG.add(P.neckMesh);

  // head
  const headG = new THREE.Group(); headG.name = "kiwi-head"; leanG.add(headG); P.head = headG;
  headG.add(mesh(gridGeo(44, 72, (a, b) => headShape(dirZ(a, b)), { disp: headTuft }), M.head, "head"));
  const beak = new Tube(18, { radial: 14, capA: 2, capB: 4 });
  const bp = []; for (let i = 0; i < 18; i++) bp.push(((t) => { const u = 1 - t; return [0, u * u * BEAK[0][1] + 2 * u * t * BEAK[1][1] + t * t * BEAK[2][1], u * u * BEAK[0][2] + 2 * u * t * BEAK[1][2] + t * t * BEAK[2][2]]; })(i / 17));
  beak.set(bp, bp.map((_, i) => { const v = i / 17; return lerp(0.0128, 0.0026, Math.pow(v, 0.75)) * (1 + 0.15 * Math.exp(-v * 12)); }), { up: [0, 1, 0], flat: 0.92 });
  headG.add(mesh(beak.geometry, M.beak, "beak"));
  for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {   // rictal bristles
    const base = [sx * 0.0095, -0.005 - k * 0.0045, 0.049 + k * 0.002], dir = norm3([sx * 0.7, 0.08 - k * 0.14, 0.7]), L = 0.04 + 0.006 * (k === 1);
    const pts = []; for (let i = 0; i < 6; i++) { const v = i / 5; pts.push(add3(add3(base, dir, L * v), [sx * 0.01 * v * v, -0.008 * v * v, 0])); }
    const tb = new Tube(6, { radial: 4, capA: 1, capB: 1 }).set(pts, pts.map((_, i) => 0.00042 * (1 - i / 6) + 0.0001));
    headG.add(mesh(tb.geometry, M.whisker, "whisker", { outline: 0, ink: false }));
  }
  // eyes: patches on the head surface drawn by the eye shader (eye-unit uv)
  P.eyeMats = EYES.map((E, i) => {
    const mat = eyeMaterial(new THREE.Color(ink).lerp(new THREE.Color("#2A140C"), 0.5));
    const geo = gridGeo(36, 36, (a, b) => {
      const ex = lerp(-1.8, 1.65, b), ey = lerp(1.8, -1.55, a);
      const q = add3(add3(E.C, E.X, ex * EYE_S), E.Y, ey * EYE_S), p = headShape(norm3(q)); return mul3(p, 1 + 0.0008 / Math.hypot(...p));
    }, { uv: (a, b) => [lerp(-1.8, 1.65, b), lerp(1.8, -1.55, a)] });
    const m = mesh(geo, mat, "eye" + (i ? "R" : "L"), { outline: 0, ink: false }); m.renderOrder = 3; headG.add(m);
    return mat;
  });
  // the little cowlick (hidden under the beanie, springs up when it flies off)
  P.tuft = new THREE.Group(); P.tuft.position.set(0, 0.044, 0.006); headG.add(P.tuft);
  for (const [dx, dz, h] of [[0, 0.006, 0.046], [0.013, -0.006, 0.034], [-0.012, -0.004, 0.037]]) {
    const pts = []; for (let i = 0; i < 7; i++) { const v = i / 6; pts.push([dx * (1 + v), h * v - 0.008 * v * v, dz - 0.03 * v * v]); }
    const tb = new Tube(7, { radial: 8, capA: 1, capB: 1 }).set(pts, pts.map((_, i) => 0.0075 * Math.pow(1 - i / 7, 0.9) + 0.0004));
    P.tuft.add(mesh(tb.geometry, M.head, "tuft"));
  }

  // legs (dynamic tubes, world space)
  P.legs = [0, 1].map((i) => { const t = new Tube(14, { radial: 10, capA: 2, capB: 2 }); worldG.add(mesh(t.geometry, M.leg, "leg" + i)); return t; });

  // boots
  const ytop = (x, z) => 0.0235 + 0.0205 * Math.sqrt(Math.max(0, 1 - (x / 0.0255) ** 2 - ((z - 0.007) / 0.047) ** 2));
  P.boots = [0, 1].map((i) => {
    const g = new THREE.Group(); g.name = "kiwi-boot" + (i ? "R" : "L"); g.rotation.order = "YXZ"; g.scale.setScalar(BOOT_S); worldG.add(g);
    g.add(mesh(gridGeo(24, 40, (a, b) => { const d = dirZ(a, b); let x = d[0] * 0.0255, y = d[1] * 0.0205, z = d[2] * 0.047; if (d[2] > 0.3 && d[1] > 0) y -= 0.006 * ((d[2] - 0.3) / 0.7) * d[1]; y = Math.max(y, -0.0155); return [x, y + 0.0235, z + 0.007]; }, { center: [0, 0.0235, 0.007] }), M.boot, "boot"));
    g.add(mesh(gridGeo(20, 32, (a, b) => { const d = dirZ(a, b); return [d[0] * 0.0235, Math.min(d[1] * 0.025, 0.0205) + 0.031, d[2] * 0.0245 - 0.013]; }, { center: [0, 0.031, -0.013] }), M.boot, "shaft"));
    const col = mesh(new THREE.TorusGeometry(0.0188, 0.0058, 8, 24).rotateX(Math.PI / 2), M.collar, "collar"); col.position.set(0, 0.0515, -0.013); g.add(col);
    const tg = mesh(gridGeo(10, 16, (a, b) => { const d = dirZ(a, b); return [d[0] * 0.0105, d[1] * 0.013, d[2] * 0.0045]; }), M.collar, "tongue"); tg.position.set(0, 0.049, 0.004); tg.rotation.x = -0.35; g.add(tg);
    g.add(mesh(gridGeo(16, 40, (a, b) => { const d = dirZ(a, b), s = sup(d, 0.45); return [s[0] * 0.0285, 0.0045 + Math.sign(d[1]) * Math.pow(Math.abs(d[1]), 0.25) * 0.0045, s[2] * 0.0515 + 0.004]; }, { center: [0, 0.0045, 0.004] }), M.sole, "sole"));
    g.add(mesh(gridGeo(12, 40, (a, b) => { const d = dirZ(a, b), s = sup(d, 0.45); return [s[0] * 0.0291, 0.005 + Math.sign(d[1]) * Math.pow(Math.abs(d[1]), 0.3) * 0.0015, s[2] * 0.0522 + 0.004]; }, { center: [0, 0.005, 0.004] }), M.mid, "midsole", { outline: 0 }));
    // laces: criss-cross over the instep and up the shaft front
    const e = 0.0095, rows = [[ytop(e, 0.031), 0.031], [ytop(e, 0.021), 0.021], [ytop(e, 0.0125) + 0.002, 0.0125], [0.041, 0.0102]];
    const seg = (x0, r0, x1, r1) => { const pts = []; for (let k = 0; k < 6; k++) { const t = k / 5, x = lerp(x0, x1, t), y = lerp(r0[0], r1[0], t), z = lerp(r0[1], r1[1], t); pts.push([x, Math.max(y, ytop(x, z)) + 0.0017 + 0.0008 * Math.sin(Math.PI * t), z + 0.0012 * Math.sin(Math.PI * t)]); } return pts; };
    const laceTube = (pts, r = 0.0014) => { const tb = new Tube(pts.length, { radial: 6, capA: 1, capB: 1 }).set(pts, pts.map(() => r), { flat: 0.75 }); const m = mesh(tb.geometry, M.lace, "lace", { outline: 2, ink: false }); g.add(m); return tb; };
    laceTube(seg(-e, rows[0], e, rows[0]));
    for (let k = 0; k < 3; k++) { laceTube(seg(-e, rows[k], e, rows[k + 1])); laceTube(seg(e, rows[k], -e, rows[k + 1])); }
    const knot = mesh(new THREE.SphereGeometry(0.0031, 10, 8), M.lace, "knot", { outline: 2, ink: false }); knot.position.set(...BOW); g.add(knot);
    const loops = [0, 1].map(() => { const tb = new Tube(16, { radial: 6, capA: 1, capB: 1 }); g.add(mesh(tb.geometry, M.lace, "bow", { outline: 2, ink: false })); return tb; });
    const tails = [0, 1].map(() => { const tb = new Tube(8, { radial: 6, capA: 1, capB: 2 }); g.add(mesh(tb.geometry, M.lace, "tail", { outline: 2, ink: false })); return tb; });
    return { g, loops, tails };
  });

  // pack (hips space)
  const pack = new THREE.Group(); pack.name = "kiwi-pack"; hips.add(pack); P.pack = pack;
  const bagX = (yN) => 0.098 * (1 - 0.05 * yN), bagZ = (yN) => 0.07 * (1 - 0.1 * yN);
  pack.add(mesh(gridGeo(28, 48, (a, b) => { const d = dirY(a, b), s = sup(d, 0.42), yN = (Math.sign(d[1]) * Math.pow(Math.abs(d[1]), 0.6) + 1) / 2; return [s[0] * bagX(yN), 0.128 + (yN * 2 - 1) * 0.128, s[2] * bagZ(yN)]; }, { center: [0, 0.128, 0] }), M.pack, "bag"));
  pack.add(mesh(gridGeo(16, 40, (a, b) => { const d = dirY(a, b), s = sup(d, 0.45), sy = Math.sign(d[1]) * Math.pow(Math.abs(d[1]), 0.5); return [s[0] * 0.103, 0.272 + sy * 0.03 + (sy > 0 ? 0.008 * (1 - s[0] * s[0]) : 0), s[2] * 0.077 - 0.004]; }, { center: [0, 0.272, 0] }), M.packDark, "lid"));
  pack.add(mesh(gridGeo(16, 32, (a, b) => { const d = dirY(a, b), s = sup(d, 0.45); return [s[0] * 0.074, 0.105 + s[1] * 0.07, -0.066 + s[2] * 0.024]; }, { center: [0, 0.105, -0.066] }), M.packDark, "pocket"));
  for (const y of [0.075, 0.19]) {   // compression bands
    const yN = y / 0.256, pts = [], ups = [];
    for (let k = 0; k <= 40; k++) { const ph = (k / 40) * Math.PI * 2 + Math.PI / 2, c = Math.cos(ph), s = Math.sin(ph); const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.42), sz = Math.sign(s) * Math.pow(Math.abs(s), 0.42); pts.push([sx * (bagX(yN) + 0.004), y, sz * (bagZ(yN) + 0.004)]); ups.push(norm3([sx / bagX(yN), 0, sz / bagZ(yN)])); }
    const tb = new Tube(41, { radial: 8, capA: 0, capB: 0 }).set(pts, pts.map(() => 0.0068), { ups, flat: 0.25 });
    pack.add(mesh(tb.geometry, M.web, "band", { outline: 2 }));
    for (const sx of [1, -1]) { const bk = mesh(new THREE.BoxGeometry(0.006, 0.017, 0.014), M.buckle, "buckle", { outline: 2 }); bk.position.set(sx * (bagX(yN) + 0.008), y, 0.02); pack.add(bk); }
  }
  const mat = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.25, 22, 1).rotateZ(Math.PI / 2), [M.mat, M.matCap, M.matCap], "mat"); mat.position.set(0, 0.338, -0.004); pack.add(mat);
  for (const x of [0.075, -0.075]) { const r = mesh(new THREE.TorusGeometry(0.0378, 0.0035, 6, 28).rotateY(Math.PI / 2), M.web, "matstrap", { outline: 2 }); r.position.set(x, 0.338, -0.004); pack.add(r); }
  { const bt = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.105, 16), M.metal, "bottle"); bt.position.set(0.113, 0.1, 0.016); pack.add(bt);
    const cp = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.016, 12), M.cap, "bottlecap"); cp.position.set(0.113, 0.16, 0.016); pack.add(cp);
    const pk = mesh(gridGeo(12, 24, (a, b) => { const d = dirY(a, b), s = sup(d, 0.5); return [s[0] * 0.026, Math.max(s[1], -0.6) * 0.04, s[2] * 0.03]; }), M.packDark, "sidepocket"); pk.position.set(0.108, 0.06, 0.016); pack.add(pk); }
  // strap tails (flutter) on his right side (-X), mug on a carabiner
  P.tails = [0.075, 0.19].map((y) => { const tb = new Tube(8, { radial: 6, capA: 1, capB: 1 }); pack.add(mesh(tb.geometry, M.web, "tailstrap", { outline: 2 })); return { tb, base: [-(bagX(y / 0.256) + 0.011), y - 0.004, 0.026] }; });
  const mugPivot = new THREE.Group(); mugPivot.position.set(-0.108, 0.235, -0.032); pack.add(mugPivot); P.mugPivot = mugPivot;
  mugPivot.add(mesh(new THREE.TorusGeometry(0.0075, 0.0017, 6, 16), M.metal, "carabiner", { outline: 2 }));
  const mug = new THREE.Group(); mug.position.set(0, -0.026, 0); mugPivot.add(mug);
  const mugProf = profileFn([[0, 0.003], [0.0155, 0.003], [0.016, 0.024], [0.0182, 0.0262], [0.0182, 0.0], [0.012, -0.0008], [0, -0.001]]);
  const cup = mesh(latheGeo(24, 28, mugProf, () => 1, { cy: 0.012 }), M.mug, "mug"); cup.rotation.z = Math.PI / 2; cup.position.set(0.012, 0, 0); mug.add(cup);
  const rim = mesh(new THREE.TorusGeometry(0.0172, 0.0017, 6, 24).rotateY(Math.PI / 2), M.mugRim, "mugrim", { outline: 0 }); rim.position.set(-0.0135, 0, 0); mug.add(rim);
  const hd = mesh(new THREE.TorusGeometry(0.0085, 0.002, 6, 14, Math.PI), M.mug, "handle", { outline: 2 }); hd.rotation.y = Math.PI / 2; hd.position.set(0, 0.017, 0); mug.add(hd);
  P.mug = mug;
  pack.position.set(...PACK_POS); pack.rotation.x = PACK_RX;

  // beanie (world space, matrix set by the rig) + pompom + snow
  const beanie = new THREE.Group(); beanie.name = "kiwi-beanie"; beanie.matrixAutoUpdate = false; worldG.add(beanie); P.beanie = beanie;
  const prof = profileFn([[0, 0.006], [0.03, 0.002], [0.0485, -0.001], [0.052, 0.003], [0.0526, 0.012], [0.0526, 0.021], [0.051, 0.0255], [0.0516, 0.029], [0.053, 0.04], [0.0515, 0.055], [0.0455, 0.071], [0.0355, 0.084], [0.022, 0.0925], [0.008, 0.0968], [0, 0.0972]]);
  const bgeo = latheGeo(48, 160, prof, (ph, a, y) => 1 + (y < 0.026 ? 0.03 : 0.016 * sstep(0.093, 0.05, y)) * (0.5 + 0.5 * Math.cos(40 * ph)), { cy: 0.045 });
  bgeo.scale(0.94, 1, 1.08);
  beanie.add(mesh(bgeo, M.beanie, "beanie"));
  const pom = new THREE.Group(); pom.name = "kiwi-pompom"; worldG.add(pom); P.pom = pom;
  pom.add(mesh(gridGeo(24, 44, (a, b) => mul3(dirY(a, b), 0.025), { disp: (a, b) => 0.007 * Math.pow(0.5 + 0.5 * noise2(a * 11, b * 23, 3), 2) + 0.0025 * noise2(a * 30, b * 60, 4) }), M.pom, "pompom"));
  const snow = mesh(gridGeo(14, 32, (a, b) => { const d = dirY(a, b); return [d[0] * 0.05, Math.max(d[1], -0.25) * 0.026 + 0.004, d[2] * 0.056]; }, { disp: (a, b) => 0.004 * noise2(a * 7, b * 14, 9) }), M.snow, "snowcap");
  snow.position.set(0, 0.07, -0.002); beanie.add(snow); P.snow = snow;
  P.bowState = null;
  return P;
}

/** Bow loops + tails on a boot. size = [left, right] loop scale, grab: {k, p:[x,y,z] boot space} pulls the left loop. */
export function setBow(boot, size = [1, 1], grab = null, flop = 0) {
  const B = BOW;
  for (let i = 0; i < 2; i++) {
    const sl = i === 0 ? 1 : -1, e = norm3([sl, 0.62, 0.38]), up = [0, 0.3, 1], w = norm3(sub3(up, mul3(e, dot3(up, e)))), l = 0.0142 * size[i];
    const far = add3(B, e, l), pts = [];
    for (let k = 0; k < 16; k++) {
      const s = k / 15, b = Math.sin(Math.PI * s);
      let p = add3(add3(B, e, l * b), w, 0.4 * l * Math.sin(2 * Math.PI * s) + flop * 0.002 * b);
      if (grab && i === 0) p = add3(p, sub3(grab.p, far), grab.k * b * b);
      pts.push(p);
    }
    boot.loops[i].set(pts, pts.map(() => 0.00135), { up: [0, 1, 0], flat: 0.75 });
    const tp = []; for (let k = 0; k < 8; k++) { const s = k / 7; tp.push([B[0] + sl * (0.0035 * s + 0.002 * s * s), B[1] - 0.003 * s - 0.016 * s * s, B[2] + 0.0055 * s - 0.002 * s * s * size[i] + flop * 0.002 * s]); }
    boot.tails[i].set(tp, tp.map((_, k) => (k > 5 ? 0.0017 : 0.0013)), { flat: 0.75 });
  }
}
