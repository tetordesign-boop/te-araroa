// BUSH — beech forest track (S06). "Goblin forest": mossy beech trunks, crown ferns, hanging moss, soft green light
// shafts from the canopy, a dirt track with roots. Layers: deep canopy glow (far trunk ranks in fog, shafts), far
// trunks, mid trunks + undergrowth band. 3D: rooted track terrain, near trunks (buttressed, painted mossy bark), crown
// ferns, moss mounds, roots (kept off the walking line), additive light shafts.
import * as K from "./land/kit.js";
import * as P from "./land/props.js";

let OPTS = {};
const trackZ = (x) => 0.04 * Math.sin(x * 0.7 + 0.3);

/** A painted beech trunk on a layer at (az, D): tapered, lit on the right, moss on the lower half, hanging moss. */
function paintTrunk(g, L, M, az, D, rad, seed, col, fogK) {
  const x = M.x(az), y0 = M.y(x, -0.2, D), ppx = (L.depth / D) * L.ppm, w = rad * 2 * ppx, r = K.rng(seed);
  if (x < -w * 2 || x > L.w + w * 2) return;
  const lean = r.range(-0.06, 0.06), top = -10;
  const c = (h) => K.mix(h, col.fog, fogK);
  const path = new Path2D(); const steps = 20;
  const xs = (k) => x + lean * (y0 - K.lerp(y0, top, k)) + K.noise1(k * 4, seed) * w * 0.08;
  const ws = (k) => w * (0.5 + 0.5 * Math.exp(-k * 18)) * (1 - k * 0.25);
  path.moveTo(xs(0) - ws(0) * 1.0, y0);
  for (let i = 0; i <= steps; i++) { const k = i / steps; path.lineTo(xs(k) - ws(k) * 0.5, K.lerp(y0, top, k)); }
  for (let i = steps; i >= 0; i--) { const k = i / steps; path.lineTo(xs(k) + ws(k) * 0.5, K.lerp(y0, top, k)); }
  path.lineTo(xs(0) + ws(0) * 1.0, y0); path.closePath();
  g.fillStyle = c(col.bark); g.fill(path);
  g.save(); g.clip(path);
  // lit right edge, rim on the left
  for (let i = 0; i < 50; i++) { const k = r(), yy = K.lerp(y0, 0, k); g.globalAlpha = r.range(0.3, 0.7); K.stroke(g, xs(k) + ws(k) * r.range(0.15, 0.45), yy, Math.PI / 2, r.range(20, 80), ws(k) * r.range(0.1, 0.25), c(col.lit), 0.7, r); }
  for (let i = 0; i < 20; i++) { const k = r(), yy = K.lerp(y0, 0, k); g.globalAlpha = r.range(0.3, 0.6); K.stroke(g, xs(k) - ws(k) * 0.42, yy, Math.PI / 2, r.range(20, 60), ws(k) * 0.08, c(col.rim), 0.7, r); }
  // moss: thick on the lower trunk, patchy higher up
  for (let i = 0; i < 120; i++) { const k = Math.pow(r(), 2.2) * 0.8, yy = K.lerp(y0, top, k); g.globalAlpha = r.range(0.5, 0.9);
    K.blob(g, xs(k) + ws(k) * r.range(-0.45, 0.4), yy, ws(k) * r.range(0.15, 0.4), ws(k) * r.range(0.1, 0.3), c(r() < 0.6 ? col.moss : col.mossLit), seed + i, 0.4, 8); }
  g.restore(); g.globalAlpha = 1;
  // hanging moss tufts from stubs
  for (let i = 0; i < 4; i++) { const k = r.range(0.25, 0.7), yy = K.lerp(y0, top, k), xx = xs(k) + r.sign() * ws(k) * 0.5;
    for (let j = 0; j < 7; j++) { g.globalAlpha = r.range(0.4, 0.8); K.stroke(g, xx + r.range(-1, 1) * w * 0.3, yy + w * r.range(0.3, 1.2), Math.PI / 2 + r.range(-0.1, 0.1), w * r.range(0.6, 1.8), w * r.range(0.05, 0.12), c(col.hang), 0.9, r); } }
  g.globalAlpha = 1;
}
/** Undergrowth band (crown fern fronds + moss mounds) along the ground line at distance D. */
function undergrowth(g, L, M, D, col, seed, n = 900, hMax = 0.8) {
  const r = K.rng(seed), ppx = (L.depth / D) * L.ppm;
  for (let i = 0; i < n; i++) {
    const x = r() * L.w, y = M.y(x, r.range(-0.3, 0.1), D), s = r.range(0.25, hMax) * ppx;
    if (r() < 0.4) { g.globalAlpha = r.range(0.6, 1); K.blob(g, x, y, s * 1.2, s * 0.5, r() < 0.5 ? col.moss : col.dark, seed + i, 0.4, 9); continue; }
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.42 + r.range(-0.1, 0.1); g.globalAlpha = r.range(0.6, 0.95);
      K.stroke(g, x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.45, a, s * r.range(0.8, 1.2), s * 0.16, k % 2 ? col.fern : col.fernLit, 0.9, r); }
  }
  g.globalAlpha = 1;
}
const PAL = { bark: "#34332F", lit: "#6A6A5C", rim: "#86B89C", moss: "#3E5A36", mossLit: "#7A9452", hang: "#A4B08A", fern: "#2A442C", fernLit: "#567A46", dark: "#18261E" };

const deepLayer = {
  name: "deep", depth: 90, brush: { r: 4, paper: 0.07 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(501);
    K.skyGrad(g, L, M, [[50, "#24402E"], [25, "#557A52"], [12, "#8CA674"], [5, "#98AE80"], [1, "#78966A"], [-3, "#4A6A4A"], [-15, "#24382A"]]);
    const [gx, gy] = M.p(12, 14); K.glow(g, gx, gy, 40 * M.dpx, "#E8F0B8", 0.55, 0.3);
    // ranks of trunks dissolving in the green haze
    for (const [D, n, k] of [[85, 40, 0.66], [55, 34, 0.48], [38, 26, 0.32]]) {
      for (let i = 0; i < n; i++) paintTrunk(g, L, M, r.range(-70, 70), D, r.range(0.25, 0.6), 510 + i + D, { ...PAL, fog: "#8EA67A" }, k);
      undergrowth(g, L, M, D, { moss: K.mix(PAL.moss, "#8EA67A", k), dark: K.mix(PAL.dark, "#8EA67A", k), fern: K.mix(PAL.fern, "#8EA67A", k), fernLit: K.mix(PAL.fernLit, "#8EA67A", k) }, 520 + D, 500, 1.2);
    }
    // light shafts slanting down from the upper right
    for (let i = 0; i < 9; i++) { const [x] = M.p(r.range(-50, 60), 0); g.globalAlpha = r.range(0.08, 0.18); K.stroke(g, x, L.h * 0.35, Math.PI / 2 + 0.22, L.h * 1.2, r.range(20, 70) * M.dpx * 0.1, "#F0F6C8", 0.2, r); }
    g.globalAlpha = 1;
  },
};
const farLayer = {
  name: "far", depth: 26, brush: { r: 3, paper: 0.06 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(531);
    for (const [D, n, k] of [[26, 18, 0.35], [18, 12, 0.22]]) {
      for (let i = 0; i < n; i++) { const az = r.range(-75, 75); paintTrunk(g, L, M, az, D, r.range(0.25, 0.55), 540 + i + D, { ...PAL, fog: "#62805A" }, k); }
      undergrowth(g, L, M, D, { moss: K.mix(PAL.moss, "#62805A", k), dark: K.mix(PAL.dark, "#62805A", k), fern: K.mix(PAL.fern, "#62805A", k), fernLit: K.mix(PAL.fernLit, "#62805A", k) }, 550 + D, 900, 1.0);
    }
    // hanging moss curtains from unseen branches
    for (let i = 0; i < 30; i++) { const [x, y] = M.p(r.range(-70, 70), r.range(8, 30)); for (let j = 0; j < 10; j++) { g.globalAlpha = r.range(0.3, 0.7); K.stroke(g, x + r.range(-20, 20), y + r.range(0, 30), Math.PI / 2, r.range(30, 110), r.range(2, 5), r() < 0.5 ? "#8EA070" : "#6E8458", 0.9, r); } }
    g.globalAlpha = 1;
  },
};
const midLayer = {
  name: "mid", depth: 11, brush: { r: 3, paper: 0.06 }, flash: 0.3,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(561);
    for (let i = 0; i < 7; i++) { const az = -60 + i * 20 + r.range(-6, 6); if (Math.abs(az - 5) < 8) continue; paintTrunk(g, L, M, az, 11, r.range(0.3, 0.55), 570 + i, { ...PAL, fog: "#4A6E48" }, 0.12); }
    undergrowth(g, L, M, 11, { moss: PAL.moss, dark: PAL.dark, fern: PAL.fern, fernLit: PAL.fernLit }, 580, 1400, 0.9);
  },
};

// ------------------------------------------------------------------------------------------------ 3D
function groundH(x, z) {
  const d = Math.abs(z - trackZ(x));
  let y = 0.12 * K.fbm2(x * 0.5, z * 0.5, 4, 591) * K.smooth((d - 0.45) / 0.8) + 0.06 * K.smooth((d - 0.4) / 1.2);
  y += Math.max(0, z - 2.6) * 0.05;
  return y;
}
function paintGround(g, w, h, A) {
  const tx = (x) => (x - A.x0) / (A.x1 - A.x0) * w, tz = (z) => (1 - (z - A.z0) / (A.z1 - A.z0)) * h, ppm = w / (A.x1 - A.x0), r = K.rng(601);
  g.fillStyle = "#2E4230"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30000; i++) { const x = K.lerp(A.x0, A.x1, r()), z = K.lerp(A.z0, A.z1, r()), s = r.range(0.04, 0.14) * ppm; g.globalAlpha = r.range(0.4, 0.85);
    K.blob(g, tx(x), tz(z), s, s * 0.7, r.pick(["#2A4030", "#3A5436", "#4E6640", "#667A48", "#203226", "#5A4A34", "#6E5A3C"]), 602 + i, 0.45, 7); }
  // track: dark soil with beech leaf litter (small warm flecks), roots painted in
  const tw = (x) => 0.36 + 0.06 * K.noise1(x * 0.9, 603);
  const tp = new Path2D(); tp.moveTo(tx(A.x0), tz(trackZ(A.x0) + tw(A.x0)));
  for (let x = A.x0; x <= A.x1; x += 0.04) tp.lineTo(tx(x), tz(trackZ(x) + tw(x)));
  for (let x = A.x1; x >= A.x0; x -= 0.04) tp.lineTo(tx(x), tz(trackZ(x) - tw(x)));
  tp.closePath(); g.save(); g.clip(tp); g.globalAlpha = 1; g.fillStyle = "#4A3A2C"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) { const x = K.lerp(A.x0, A.x1, r()), z = trackZ(x) + r.range(-0.4, 0.4), s = r.range(0.006, 0.02) * ppm; g.globalAlpha = r.range(0.5, 0.95);
    g.fillStyle = r.pick(["#7A5A36", "#9A7444", "#5E4430", "#3A2C22", "#B08A50"]); g.beginPath(); g.ellipse(tx(x), tz(z), s * 1.6, s, r() * 3, 0, 6.3); g.fill(); }
  g.restore(); g.globalAlpha = 0.6; g.strokeStyle = "#2A3A22"; g.lineWidth = 6; g.stroke(tp); g.globalAlpha = 1;
  // foreground in shade (toward the camera), dappled sunlight through the canopy behind
  const gf = g.createLinearGradient(0, tz(0.4), 0, tz(3)); gf.addColorStop(0, "rgba(10,20,14,0)"); gf.addColorStop(1, "rgba(10,20,14,0.55)"); g.fillStyle = gf; g.fillRect(0, tz(3), w, tz(0.4) - tz(3));
  g.fillStyle = "rgba(10,20,14,0.55)"; g.fillRect(0, 0, w, tz(3));
  for (let i = 0; i < 260; i++) { const x = K.lerp(A.x0, A.x1, r()), z = K.lerp(-8, 0.6, Math.pow(r(), 0.7)), s = r.range(0.1, 0.45) * ppm;
    g.globalAlpha = r.range(0.35, 0.7); K.blob(g, tx(x), tz(z), s * 1.6, s * 0.8, r() < 0.5 ? "#B6C87A" : "#D8DC98", 605 + i, 0.4, 12); }
  g.globalAlpha = 1;
}
function trunkGeo(ctx, r0, H, seed) {
  const { THREE } = ctx; const g = new THREE.CylinderGeometry(r0 * 0.8, r0, H, 18, 28, true); g.translate(0, H / 2, 0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.12 * K.noise2(a * 2, y * 0.8, seed) + 0.7 * Math.exp(-y / 0.35) * (0.5 + 0.5 * Math.cos(a * 4 + seed)) + 0.25 * Math.exp(-y / 0.8);
    p.setXYZ(i, x * k, y - (y < 0.01 ? 0.15 : 0), z * k);
  }
  g.computeVertexNormals(); return g;
}

const BASE = [deepLayer, farLayer, midLayer];
export default {
  get layers() { return BASE; },
  build(ctx) {
    OPTS = ctx.opts ?? {};
    const { THREE, inkable } = ctx;
    const group = new THREE.Group(); group.name = "bush";
    const A = { x0: -8, x1: 8, z0: -10, z1: 5 };
    const tex = ctx.paintTexture(4096, 3840, (g, w, h) => paintGround(g, w, h, A), { r: 2, paper: 0.05 });
    const gmat = ctx.celMaterial({ map: tex, thresh: -0.4, rim: 0.2, shade: 0.7 });
    const T = P.terrain(ctx, { x0: -14, x1: 14, z0: -16, z1: 8, nx: 112, nz: 96, h: groundH, material: gmat, uv: (x, z) => [K.clamp((x - A.x0) / (A.x1 - A.x0)), K.clamp((z - A.z0) / (A.z1 - A.z0))] });
    group.add(T.mesh, P.inkOccluder(ctx, T.mesh));
    const heightAt = T.heightAt;
    // bark texture: dark grey-brown, vertical fissures, moss thick at the base, lichen
    const bark = ctx.paintTexture(512, 2048, (g, w, h) => {
      const r = K.rng(611); g.fillStyle = "#4A4842"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { g.globalAlpha = r.range(0.3, 0.8); K.stroke(g, r() * w, r() * h, Math.PI / 2 + r.range(-0.08, 0.08), r.range(30, 140), r.range(2, 7), r.pick(["#2A2824", "#4E4A40", "#5E5A4C", "#33302A"]), 0.6, r); }
      for (let i = 0; i < 1600; i++) { const v = Math.pow(r(), 3.2) * 0.45; g.globalAlpha = r.range(0.5, 0.95); K.blob(g, r() * w, h - v * h, r.range(6, 22), r.range(5, 16), r.pick(["#3E5A36", "#55703E", "#7A9452", "#2E4430"]), 612 + i, 0.4, 8); }
      for (let i = 0; i < 300; i++) { g.globalAlpha = 0.7; K.blob(g, r() * w, r() * h * 0.8, r.range(3, 9), r.range(2, 7), r.pick(["#A8B094", "#C4C8A8"]), 613 + i, 0.4, 7); }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0.05 });
    bark.wrapS = THREE.RepeatWrapping;
    const colliders = [T.mesh];
    const trunks = [[1.3, 0.62, 0.32], [-2.3, -1.4, 0.42], [1.7, -1.8, 0.5], [3.1, -0.9, 0.3], [-3.6, -3.2, 0.45], [0.6, -4.2, 0.55], [-1.2, -6.5, 0.4], [2.6, -6.0, 0.46], [4.8, -3.6, 0.5], [-5.4, -1.2, 0.48], [5.6, 0.6, 0.4], [-3.0, 1.1, 0.4]];
    trunks.forEach(([x, z, rad], i) => {
      const m = new THREE.Mesh(trunkGeo(ctx, rad, 14, 620 + i), ctx.celMaterial({ map: bark, color: "#D8D4CC", rim: 1.2, thresh: 0.2, shade: 0.9 }));
      m.position.set(x, heightAt(x, z), z); m.rotation.set(K.hash(i, 1) * 0.06 - 0.03, K.hash(i, 2) * 6, K.hash(i, 3) * 0.06 - 0.03); m.name = "trunk"; m.userData.closed = false;
      inkable(m); group.add(m); colliders.push(m);
    });
    // roots radiating from the trunk bases (kept off the walking line |x| < 0.8 near z = 0)
    const rootMat = ctx.celMaterial({ color: "#4E4032", rim: 0.8 });
    trunks.slice(0, 6).forEach(([tx0, tz0, rad], i) => {
      const rr = K.rng(630 + i);
      for (let k = 0; k < 4; k++) {
        const a = rr.range(0, 6.3), len = rr.range(0.5, 1.0), th = rad * rr.range(0.09, 0.15);
        const pts = Array.from({ length: 6 }, (_, j) => { const u = j / 5, x = tx0 + Math.cos(a + Math.sin(u * 3) * 0.3) * (rad * 0.8 + len * u), z = tz0 + Math.sin(a + Math.sin(u * 3) * 0.3) * (rad * 0.8 + len * u);
          const onWalk = Math.abs(z - trackZ(x)) < 0.25 && Math.abs(x) < 0.9; return new THREE.Vector3(x, heightAt(x, z) + th * (0.4 - u * 1.6) - (onWalk ? th * 2.5 : 0), z); });
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, th, 8), rootMat); m.name = "root"; inkable(m); group.add(m);
      }
    });
    // crown ferns: foreground corners for parallax, a dense understory behind
    const ferns = [[-0.85, 1.3, 0.9], [0.75, 1.35, 0.8], [-1.5, 1.6, 0.9], [-1.8, -0.7, 1], [1.0, -0.9, 0.9], [-0.4, -1.6, 1.1], [2.4, -2.4, 1], [-2.9, -2.0, 1.1], [0.3, -2.8, 1], [-1.4, -3.4, 1.2], [3.6, -1.6, 1], [-4.2, -0.6, 1.1], [1.9, 0.9, 0.7], [-2.6, 0.95, 0.8], [4.2, 1.2, 0.9], [-4.4, 1.6, 0.9]];
    ferns.forEach(([x, z, k], i) => group.add(P.fern(ctx, { x, z, y: heightAt(x, z), seed: 640 + i, n: 14, len: [0.55 * k, 0.95 * k], colors: ["#2E5A2C", "#3A6A32", "#28502A"], tip: "#7EAA4C", pinna: 0.1 })));
    // moss mounds
    const mounds = P.scatter(220, 651, (r) => { const x = r.range(-6, 6), z = r.range(-6, 2.6); if (Math.abs(z - trackZ(x)) < 0.55) return null; const s = r.range(0.04, 0.13); return { x, z, s: [s * 1.3, s * 0.6, s], yaw: r.range(0, 6.3), c: [r.range(0.8, 1.1), r.range(0.85, 1.1), r.range(0.8, 1)] }; });
    group.add(P.instanced(ctx, P.rockGeo(ctx, { seed: 652, detail: 2, flat: 0.9, jag: 0.12 }), mounds, { heightAt, name: "moss", color: "#4A6A3A", thresh: -0.1, rim: 1, side: THREE.FrontSide, sink: 0.25 }));
    // light shafts: additive slanted quads facing the camera around their axis
    const shaftTex = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d"); const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, "rgba(255,255,255,0)"); gx.addColorStop(0.5, "rgba(255,255,255,1)"); gx.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gx; g.fillRect(0, 0, 64, 256); g.globalCompositeOperation = "destination-in"; const gy = g.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, "rgba(0,0,0,0.2)"); gy.addColorStop(0.5, "rgba(0,0,0,1)"); gy.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gy; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c); })();
    const shafts = [];
    for (const [x, z, w, a] of [[0.9, -2.6, 0.9, 0.26], [-1.6, -4.5, 1.4, 0.22], [2.8, -5.5, 1.6, 0.2], [-0.2, -7.5, 2.0, 0.18], [-3.4, -2.2, 1.0, 0.2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), new THREE.MeshBasicMaterial({ map: shaftTex, color: "#E6F0B0", transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(x, 3.2, z); m.name = "light-shaft"; m.renderOrder = 3; group.add(m); shafts.push(m);
    }
    const cs = P.contactShadow(ctx, { size: [0.5, 0.4], a: 0.45, color: "#0E1A12" }); group.add(cs.mesh);
    group.updateMatrixWorld(true);   // nested props (marker post, signpost) must have world matrices before any render
    return {
      group, heightAt, colliders,
      update(t, t2, c) {
        cs.update(c, heightAt);
        for (const m of shafts) { const dx = c.camera.position.x - m.position.x, dz = c.camera.position.z - m.position.z; m.rotation.set(0, Math.atan2(dx, dz), 0); m.rotateZ(-0.22); }
      },
      dispose() {},
    };
  },
};
