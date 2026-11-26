// BLUFF — Stirling Point at sunrise (S16). Layers: sunrise sky (gold horizon, lit cumulus bank, high altocumulus,
// sun), the strait (Rakiura / Stewart Island low on the horizon, a tiny striped lighthouse on Dog Island), the rocky
// coast either side. 3D: the grassy point sloping to the rocks, gravel apron, the generic signpost (pole + blank arrow
// boards, no text), flax and tussock, boulders, a calm sea with an animated sun-glitter path, the last trail marker
// (lights up at opts.markerLit with a spring overshoot + glow), contact shadow.
import * as K from "./land/kit.js";
import * as P from "./land/props.js";
import { RIG_U } from "../core/cel.js";
import { ease } from "../core/time.js";

let OPTS = {};
const SUN = [29, 2.6], SEA_Y = -2.5;
const edgeZ = (x) => -9.3 + 0.38 * x + 0.4 * Math.sin(x * 0.6);

const skyLayer = {
  name: "sky", depth: 900, brush: { r: 4, paper: 0.07 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(701), [sx, sy] = M.p(...SUN);
    K.skyGrad(g, L, M, [[70, "#2A3470"], [40, "#3E4A88"], [22, "#7A6EA8"], [12, "#C08AA6"], [6, "#F0A898"], [3, "#FFC488"], [1, "#FFD89C"], [0, "#FFE2B0"], [-3, "#F6C49A"]]);
    K.glow(g, sx, sy, 70 * M.dpx, "#FFC27A", 0.45, 0.3); K.glow(g, sx, sy, 20 * M.dpx, "#FFE6B4", 0.7, 0.3);
    // crepuscular rays fanning from the sun
    for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + r.range(-1.3, 1.3); g.globalAlpha = r.range(0.04, 0.1); K.stroke(g, sx + Math.cos(a) * 35 * M.dpx, sy + Math.sin(a) * 35 * M.dpx, a, 70 * M.dpx, r.range(2, 6) * M.dpx, "#FFF0D0", 0.1, r); }
    g.globalAlpha = 1;
    // high altocumulus streaks, pink-gold underlit
    for (let i = 0; i < 16; i++) { const [x, y] = M.p(r.range(-75, 80), r.range(12, 36)); K.streakCloud(g, x, y, r.range(10, 26) * M.dpx, r.range(0.6, 1.6) * M.dpx, ["#F2A8A0", "#D890A8", "#FFD2B0"], 710 + i, 0.6); }
    K.cloudField(g, L, M, {
      n: 50, seed: 720, az: [-85, 85], D: [5000, 45000], alt: [1000, 1600], W: [1200, 3600], H: [400, 1200], tall: 0.3, sun: [sx, sy], maxW: 16,
      pal: (D, c) => { const f = K.clamp((D - 5000) / 30000), ns = Math.exp(-(((c.az - SUN[0]) / 30) ** 2));
        return { shadow: K.mix(K.mix("#6E5E98", "#9A7AA8", ns * 0.6), "#E8A8A0", f * 0.6), mid: K.mix(K.mix("#C48AA8", "#F0A090", ns), "#F6C0A8", f * 0.5), lit: K.mix("#FFD49C", "#FFEAC0", ns), hi: "#FFF6E0", base: K.mix("#5E5290", "#D898A0", f * 0.7) }; },
      underGlow: (c) => Math.abs(c.az - SUN[0]) < 40 ? "#FFC07A" : null,
      skip: (az, eb) => Math.abs(az - SUN[0]) < 4 && eb < 5,
    });
    // the sun, just clear of a thin horizon bank
    K.glow(g, sx, sy, 3 * M.dpx, "#FFF8E8", 1, 0.5); g.fillStyle = "#FFFCF2"; g.beginPath(); g.arc(sx, sy, 0.6 * M.dpx, 0, 6.3); g.fill();
    const yH = L.yy(0);
    K.streakCloud(g, sx - 6 * M.dpx, M.el(sx, 1.4), 30 * M.dpx, 0.5 * M.dpx, ["#E8A088", "#C88090"], 730, 0.7);
    // below the horizon: the strait (the 3D sea fades into this)
    const gr = g.createLinearGradient(0, yH, 0, L.h); gr.addColorStop(0, "#E8B49A"); gr.addColorStop(0.1, "#8E7A9A"); gr.addColorStop(1, "#3E4678"); g.fillStyle = gr; g.fillRect(0, yH, L.w, L.h - yH);
    for (let i = 0; i < 900; i++) { const k = Math.pow(r(), 1.5), y = yH + 1 + k * (L.h - yH), x = sx + r.gauss() * (3 + k * 12) * M.dpx * 0.5;
      g.globalAlpha = r.range(0.3, 0.8) * (1 - k * 0.6); K.stroke(g, x, y, 0, r.range(6, 26) * (0.5 + k * 2), r.range(1, 3) * (0.6 + k * 2), r() < 0.6 ? "#FFF0C8" : "#FFC888", 0.9, r); }
    g.globalAlpha = 1;
  },
};

const straitLayer = {
  name: "strait", depth: 600, brush: { r: 3, paper: 0.06 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), deg = (e) => L.depth * Math.tan(e * Math.PI / 180), yH = L.yy(0);
    // Rakiura / Stewart Island: long low hazy silhouette on the left horizon
    const rd = K.ridge(L, M, L.depth, (az) => { if (az < -62 || az > -4) return -40; const u = (az + 62) / 58; return deg(0.35 + 0.9 * Math.sin(Math.PI * u) * (0.8 + 0.4 * K.fbm1(az / 4, 4, 741))); }, { crown: 0.3, crownWave: 5, seed: 742 });
    K.bushHill(g, L, rd, { base: "#8C7CA4", shadow: "#82729C", mid: "#9484AA", lit: "#D8A8A8", rim: "#FFD8B0", haze: "#E8B6A6" }, 743, { light: 1, dab: 3, n: 800, rimA: 0.8, hazeH: 0.6, dabA: [0.1, 0.25], spurA: [0.1, 0.2] });
    // Dog Island and its striped lighthouse
    const [dx] = M.p(-14, 0); const di = 1.2 * M.dpx;
    K.blob(g, dx, yH - di * 0.08, di, di * 0.16, "#6E6488", 744, 0.2, 12);
    const lh = 0.32 * M.dpx, lw = Math.max(2, 0.05 * M.dpx);
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? "#F4E8DC" : "#2A2838"; g.fillRect(dx - lw / 2, yH - di * 0.15 - lh * (k + 1) / 6, lw, lh / 6 + 0.5); }
    K.band(g, L.w, yH - 0.1 * M.dpx, 0.6 * M.dpx, "#F6C8A8", 0.5);
  },
};

const coastLayer = {
  name: "coast", depth: 90, brush: { r: 3, paper: 0.06 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), deg = (e) => L.depth * Math.tan(e * Math.PI / 180), yH = L.yy(0), r = K.rng(751);
    // the rocky coast running away on both sides (Bluff Hill's flank on the left)
    const sides = [{ a0: -95, a1: -18, e: (u) => 2 + 9 * Math.pow(1 - u, 1.4), seed: 752 }, { a0: 48, a1: 100, e: (u) => 0.6 + 4 * Math.pow(u, 1.2), seed: 753 }];
    for (const S of sides) {
      const rd = K.ridge(L, M, L.depth, (az) => { if (az < S.a0 || az > S.a1) return -40; const u = (az - S.a0) / (S.a1 - S.a0); return deg(S.e(u) * (0.9 + 0.2 * K.fbm1(az / 5, 4, S.seed))); }, { crown: 1.2, crownWave: 4, seed: S.seed });
      K.bushHill(g, L, rd, { base: "#4A4A6E", shadow: "#3A3C62", mid: "#56567A", lit: "#C88A7A", rim: "#FFC890", haze: "#D8A0A0" }, S.seed, { light: 1, dab: 6, n: 3500, rimA: 1, hazeH: 0.3 });
      for (let i = 0; i < 120; i++) { const az = r.range(S.a0, S.a1), x = M.x(az); if (!(rd.top(x) < yH - 2)) continue; const w = r.range(0.6, 2.5) * L.ppm;
        K.blob(g, x, yH - w * 0.15, w, w * 0.35, r.pick(["#3E3A58", "#4E4866"]), 760 + i, 0.3, 9); g.globalAlpha = 0.8; K.stroke(g, x + r.range(-w, w), yH - r.range(0, 0.3) * L.ppm, 0, w * r.range(0.6, 1.5), r.range(1.5, 3), "#FFE8D0", 0.8, r); g.globalAlpha = 1; }
    }
  },
};

// ------------------------------------------------------------------------------------------------ 3D
function seaMesh(ctx) {
  const { THREE } = ctx, U = RIG_U;
  const a = SUN[0] * Math.PI / 180, e = SUN[1] * Math.PI / 180;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: U.uFogColor, uFlash: U.uFlash, uFlashColor: U.uFlashColor, uSun: { value: new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFogColor; uniform float uFlash; uniform vec3 uFlashColor; uniform vec3 uSun; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
        vec2 p = vW.xz; float t = uTime;
        vec2 gr = vec2(vn(p * vec2(0.6, 1.8) + vec2(t * 0.3, t * 0.5)) - vn(p * vec2(0.6, 1.8) + vec2(t * 0.3 + 0.37, t * 0.5)), vn(p * vec2(1.3, 3.1) - vec2(0.0, t * 0.7)) - 0.5);
        vec3 n = normalize(vec3(gr.x * 0.5, 1.0, gr.y * 0.6));
        vec3 R = reflect(-V, n);
        float sunDot = dot(R, uSun), side = dot(normalize(vec2(-V.x, -V.z)), normalize(uSun.xz));
        // sky colour seen in the water: gold toward the sun, violet away
        vec3 col = mix(vec3(0.24, 0.25, 0.45), vec3(0.55, 0.42, 0.55), smoothstep(-0.2, 0.9, side));
        col = mix(col, vec3(0.98, 0.72, 0.48), smoothstep(0.85, 0.995, side) * 0.7);
        float band = smoothstep(0.3, 0.6, vn(p * vec2(0.08, 0.9) + vec2(0.0, t * 0.2)));
        col *= 0.88 + 0.18 * band;
        float glit = smoothstep(0.985, 0.996, sunDot) * step(0.55, vn(p * vec2(3.0, 9.0) + vec2(t * 2.0, -t * 3.0)));
        col = mix(col, vec3(1.0, 0.95, 0.8), glit);
        float foam = smoothstep(0.7, 0.8, vn(p * vec2(0.5, 2.0) + vec2(t * 0.15, 0.0))) * (1.0 - smoothstep(20.0, 120.0, dist)) * 0.35;
        col = mix(col, vec3(1.0, 0.92, 0.85), foam);
        col = mix(col, uFogColor, pow(smoothstep(30.0, 900.0, dist), 0.7) * 0.85);
        col = mix(col, uFlashColor, uFlash * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1300, 1, 1).rotateX(-Math.PI / 2), mat); m.position.set(0, SEA_Y, -650); m.name = "sea"; m.frustumCulled = false;
  return m;
}
function groundH(x, z) {
  const e = edgeZ(x), d = z - e;                       // > 0 inland
  let y = -0.85 * K.smooth(1 - K.clamp((z - e) / Math.max(1, -e - 0.5)));
  if (d < 0) y = -0.85 - 2.2 * K.smooth(-d / 2.2) + 0.3 * K.fbm2(x * 0.9, z * 0.9, 3, 771) * K.smooth(-d / 0.5);
  y += 0.04 * K.fbm2(x * 0.7, z * 0.7, 3, 772) * K.smooth((Math.hypot(x - 0.4, z + 0.1) - 1.2) / 1.0);
  y += Math.max(0, z - 3) * 0.04 + Math.max(0, -x - 3) * 0.06;
  const flat = 1 - K.smooth((Math.hypot(x - 0.45, z + 0.15) - 1.1) / 0.8);
  return K.lerp(y, 0, flat);
}
const SIGN = [0.85, -7.5];
function paintGround(g, w, h, A) {
  const tx = (x) => (x - A.x0) / (A.x1 - A.x0) * w, tz = (z) => (1 - (z - A.z0) / (A.z1 - A.z0)) * h, ppm = w / (A.x1 - A.x0), r = K.rng(781);
  g.fillStyle = "#6A7040"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30000; i++) { const x = K.lerp(A.x0, A.x1, r()), z = K.lerp(A.z0, A.z1, r()), d = z - edgeZ(x), s = r.range(0.05, 0.14) * ppm;
    const c = d < 0.3 ? r.pick(["#4E4A5E", "#5E5868", "#3E3C50", "#7A6E6E"]) : r.pick(["#5E6A38", "#7A7E44", "#8E8A4C", "#4E5A34", "#A09450", "#6A7040"]);
    g.globalAlpha = r.range(0.4, 0.85); K.stroke(g, tx(x), tz(z), r.range(-0.3, 0.3), s * 3.2, s * 0.8, c, 0.8, r); }
  // gravel apron around the signpost and a worn path toward the point
  g.globalAlpha = 1; g.fillStyle = "#9A8C7C"; g.beginPath(); g.ellipse(tx(SIGN[0]), tz(SIGN[1]), 1.6 * ppm, 1.2 * ppm, 0, 0, 6.3); g.fill();
  const pz = (x) => -0.15 - 0.42 * x;
  for (let i = 0; i < 16000; i++) { const x = r.range(-2, 6), z = pz(x) + r.range(-0.32, 0.32); if (z < edgeZ(x) + 0.5) continue; g.globalAlpha = r.range(0.4, 0.9); const s = r.range(0.006, 0.03) * ppm;
    g.fillStyle = r.pick(["#A8987E", "#8A7C68", "#C0B096", "#6E6254"]); g.beginPath(); g.ellipse(tx(x), tz(z), s * 1.5, s, r() * 3, 0, 6.3); g.fill(); }
  for (let i = 0; i < 8000; i++) { const a = r() * 6.3, rr = Math.sqrt(r()) * 1.5; g.globalAlpha = r.range(0.5, 0.9); const s = r.range(0.01, 0.04) * ppm;
    g.fillStyle = r.pick(["#B8AA94", "#8E8270", "#D0C4AE", "#6E6458"]); g.beginPath(); g.ellipse(tx(SIGN[0] + Math.cos(a) * rr), tz(SIGN[1] + Math.sin(a) * rr * 0.75), s * 1.4, s, r() * 3, 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
}
function signpost(ctx, x, z, y) {
  const { THREE, inkable } = ctx; const grp = new THREE.Group(); grp.name = "signpost";
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.2, 12), ctx.celMaterial({ color: "#E8E2D6", rim: 1, hi: 0.3 })); pole.position.y = 1.6; pole.name = "sign-pole";
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 12), ctx.celMaterial({ color: "#9C948A", rim: 0.8 })); base.position.y = 0.05; base.name = "sign-base";
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), ctx.celMaterial({ color: "#E8E2D6", rim: 1 })); cap.position.y = 3.24;
  grp.add(pole, base, cap);
  // blank arrow boards: a long board with a pointed end, cream face, dark slate edge band
  const r = K.rng(791), boardMat = ctx.celMaterial({ color: "#F2EAD8", rim: 1, hi: 0.2 }), edgeMat = ctx.celMaterial({ color: "#4A4E66", rim: 0.8 });
  const mk = (len) => { const s = new THREE.Shape(), hh = 0.075; s.moveTo(0.07, -hh); s.lineTo(len - 0.12, -hh); s.lineTo(len, 0); s.lineTo(len - 0.12, hh); s.lineTo(0.07, hh); s.closePath(); return s; };
  for (let i = 0; i < 9; i++) {
    const len = r.range(0.7, 1.15), yaw = r.range(-Math.PI, Math.PI), hgt = 1.75 + i * 0.15 + r.range(-0.02, 0.02);
    const geo = new THREE.ExtrudeGeometry(mk(len), { depth: 0.028, bevelEnabled: false }); geo.translate(0, 0, -0.014);
    const b = new THREE.Mesh(geo, boardMat); b.position.y = hgt; b.rotation.y = yaw; b.name = "sign-board";
    const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(mk(len * 0.995), { depth: 0.032, bevelEnabled: false }).translate(0, 0, -0.016).scale(1, 0.25, 1), edgeMat); stripe.position.y = hgt - 0.052; stripe.rotation.y = yaw;
    grp.add(b, stripe);
  }
  grp.position.set(x, y, z); inkable(grp);
  grp.traverse((o) => { if (o.isMesh) o.userData.closed = true; });
  return grp;
}

const BASE = [skyLayer, straitLayer, coastLayer];
export default {
  get layers() { return BASE; },
  build(ctx) {
    OPTS = ctx.opts ?? {};
    const { THREE, inkable } = ctx;
    const group = new THREE.Group(); group.name = "bluff";
    const A = { x0: -10, x1: 12, z0: -13, z1: 7 };
    const tex = ctx.paintTexture(4096, 3724, (g, w, h) => paintGround(g, w, h, A), { r: 2, paper: 0.05 });
    const gmat = ctx.celMaterial({ map: tex, thresh: -0.35, rim: 0.4, shade: 0.7 });
    const T = P.terrain(ctx, { x0: -24, x1: 24, z0: -15, z1: 10, nx: 192, nz: 100, h: groundH, material: gmat,
      uv: (x, z) => [K.clamp((x - A.x0) / (A.x1 - A.x0)), K.clamp((z - A.z0) / (A.z1 - A.z0))], keep: (a, b, c, d) => Math.max(a, b, c, d) > SEA_Y - 0.6 });
    group.add(T.mesh, P.inkOccluder(ctx, T.mesh));
    const heightAt = T.heightAt;
    const sea = seaMesh(ctx); group.add(sea);
    const sp = signpost(ctx, SIGN[0], SIGN[1], heightAt(...SIGN) - 0.04); group.add(sp);
    const colliders = [T.mesh]; sp.traverse((o) => { if (o.isMesh) colliders.push(o); });
    const [mx, mz] = OPTS.marker ?? [0.55, -0.35];
    const post = P.markerPost(ctx, mx, mz, { y: heightAt(mx, mz) - 0.02, yaw: -24, h: 1.1 }); group.add(post.group); colliders.push(...post.colliders);
    // flax and tussock on the point, boulders at the edge
    for (const [x, z, sd, n] of [[-2.6, -1.8, 801, 18], [-3.8, 0.8, 802, 16], [3.6, -3.0, 803, 14], [-1.4, -5.6, 804, 15]]) {
      const f = P.flax(ctx, { x, z, y: heightAt(x, z), seed: sd, n, len: [0.8, 1.5], colors: ["#4A5E34", "#56683A", "#3E5030"], tipColor: "#9A9A58", sway: { wind: [0.05, 0, -0.02], h: 1.2 } }); group.add(f);
    }
    const tus = P.scatter(500, 811, (r) => { const x = r.range(-7, 9), z = r.range(-9, 4.5); if (z < edgeZ(x) + 0.4) return null; if (Math.hypot(x - 0.45, z + 0.1) < 0.7 || Math.hypot(x - SIGN[0], z - SIGN[1]) < 1.7) return null;
      if (Math.abs(z - (-0.15 - 0.42 * x)) < 0.4 && x > -1) return null; const s = r.range(0.12, 0.32); return { x, z, s, sy: s * r.range(0.8, 1.2), yaw: r.range(0, 6.3) }; });
    group.add(P.instanced(ctx, P.tuftGeo(ctx, { blades: 18, seed: 812, base: "#5A5A34", tip: "#E8C888", width: 0.05, lean: 1 }), tus, { heightAt, name: "tussock", sink: 0.03, thresh: -0.4, rim: 1, sway: { wind: [0.03, 0, -0.01], h: 0.5 } }));
    const rr = K.rng(821);
    for (let i = 0; i < 30; i++) {
      const x = rr.range(-12, 14), z = edgeZ(x) + rr.range(-2, 0.5), s = rr.range(0.25, 0.9);
      const m = new THREE.Mesh(P.rockGeo(ctx, { seed: 830 + i, detail: 1, flat: 0.7, jag: 0.28 }), ctx.celMaterial({ color: rr.pick(["#6A6070", "#5A5468", "#7A6E74"]), rim: 1.1 }));
      m.position.set(x, heightAt(x, z) - s * 0.2, z); m.scale.set(s * rr.range(1, 1.5), s, s); m.rotation.y = rr.range(0, 6.3); m.name = "boulder"; m.userData.closed = true;
      inkable(m); group.add(m); colliders.push(m);
    }
    const cs = P.contactShadow(ctx, { size: [0.5, 0.4], a: 0.35, color: "#2A2040" }); group.add(cs.mesh);
    const swayMats = []; group.traverse((o) => { if (o.material?.uniforms?.uWind) swayMats.push(o.material); });
    const tLit = OPTS.markerLit ?? Infinity;
    group.updateMatrixWorld(true);   // nested props (marker post, signpost) must have world matrices before any render
    return {
      group, heightAt, colliders,
      update(t, t2, c) {
        sea.material.uniforms.uTime.value = t2;
        for (const m of swayMats) m.uniforms.uTime.value = t2;
        cs.update(c, heightAt);
        // the last triangle lights: sudden on, spring overshoot, settles bright
        const u = t - tLit; const k = u < 0 ? 0 : ease.spring(u, 2.2, 0.32) * 1.15 + Math.exp(-u * 10) * 0.6;
        post.setLit(k, c.camera);
      },
      dispose() {},
    };
  },
};
