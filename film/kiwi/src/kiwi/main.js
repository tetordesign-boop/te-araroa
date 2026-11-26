// The kiwi rig: applies the pure pose (pose.js) to the model (model.js) each frame. Root + planted-foot IK on ones,
// everything else on twos; secondary motion (pompom, pack, mug, beanie flop) are damped springs simulated from a fixed
// window before t2, so every frame is a pure function of time.
import * as THREE from "three";
import { buildModel, setBow, EYES, HIPJ, ANKLE, LEG, SOCK, BC, BEAK_TIP, BEANIE_POS, BEANIE_RX, BEANIE_TOP, PACK_POS, PACK_RX, PACK_C } from "./model.js";
import * as PO from "./pose.js";
import { clamp, lerp, sstep, add3, sub3, mul3, len3, norm3, cross3, dot3, rotY, rotX, eul, rotAxis, resample, smoothPts, ring } from "./util.js";

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (v) => [v.x, v.y, v.z];
const UP = [0, 1, 0];

/** World position of a root-local (pre-lean) point. */
function toWorld(R, M, p) { const l = M.lean ? rotAxis(p, M.leanAxis, M.lean) : p; const r = rotY(l, R.yaw); return [r[0] + R.x, r[1] + R.y, r[2] + R.z]; }
/** Head world matrix at time t (pose on twos of t). */
function headMatrix(D, t, hAt, out = new THREE.Matrix4()) {
  const R = PO.rootAt(D, t, hAt), M = PO.macro(D, Math.floor(t * 12 + 1e-6) / 12, R);
  const m = new THREE.Matrix4().makeTranslation(R.x, R.y, R.z).multiply(new THREE.Matrix4().makeRotationY(R.yaw));
  if (M.lean) m.multiply(new THREE.Matrix4().makeRotationAxis(v3(M.leanAxis), M.lean));
  m.multiply(new THREE.Matrix4().makeTranslation(...M.headPos)).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(M.head[0], M.head[1], M.head[2], "YXZ")));
  return out.copy(m);
}
const BEANIE_L = new THREE.Matrix4().makeTranslation(...BEANIE_POS).multiply(new THREE.Matrix4().makeRotationX(BEANIE_RX));

/** Free-flying beanie (world) at time s: {pos, quat}. Needs D._offB / D._landB (beanie matrices at take-off / landing). */
function flight(D, bm) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  if (bm.mode === "off") {
    D._offB.decompose(p, q, s);
    const k = bm.k, a = Math.max(0, k - 0.18), yaw = D.yawStand, lift = 0.022 * sstep(0, 0.22, k);
    p.x += Math.sin(yaw) * (0.12 * a + 0.28 * a * a); p.z += Math.cos(yaw) * (0.12 * a + 0.28 * a * a) - 0.08 * a;
    p.y += lift + 0.32 * a + 0.62 * a * a;
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 * sstep(0, 0.22, k) + 0.06 * Math.sin(k * 31) * (1 - sstep(0, 0.3, k)));
    const tum = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.6, 0.3, 0.74).normalize(), 1.5 * a + 2.6 * a * a);
    q.multiply(tilt).premultiply(tum);
  } else {
    D._landB.decompose(p, q, s);
    const k = bm.k, th = 5.2 * k, A = 0.17 * sstep(0.04, 0.5, k), lat = new THREE.Vector3(1, 0, 0.25).normalize();
    p.addScaledVector(lat, A * Math.sin(th)); p.y += 0.95 * k + 0.035 * (1 - Math.cos(2 * th)) * sstep(0.05, 0.5, k);
    const bank = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lat).normalize(), -0.55 * (A / 0.17) * Math.cos(th));
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9 * k);
    q.premultiply(spin).premultiply(bank);
  }
  return { pos: p, quat: q };
}
function ensureFlight(D, hAt) {
  if (D.off[0] && !D._offB) D._offB = headMatrix(D, D.off[0].t0, hAt).multiply(BEANIE_L);
  if (D.land[0] && !D._landB) D._landB = headMatrix(D, D.land[0].t1, hAt).multiply(BEANIE_L);
}
const TOPV = v3(BEANIE_TOP);
function crownWorld(D, R, M, bm) {
  if (bm.mode === "off" || bm.mode === "land") { const f = flight(D, bm); return arr(TOPV.clone().applyQuaternion(f.quat).add(f.pos)); }
  return toWorld(R, M, add3(M.headPos, eul(add3(BEANIE_POS, rotX(BEANIE_TOP, BEANIE_RX)), M.head)));
}

/** Secondary motion springs, simulated over a fixed window before u. */
function secondary(D, u, hAt) {
  const s0 = Math.max(D.shotT0 - 0.4, u - 1.8), dt = 1 / 120;
  const drive = (s) => {
    const R = PO.rootAt(D, s, hAt), M = PO.macro(D, s, R), bm = PO.beanieMode(D, s), w = PO.windAt(D, s), ws = len3(w);
    const crown = bm.mode === "hidden" ? [0, 0, 0] : crownWorld(D, R, M, bm);
    const push = add3(mul3(w, 0.02), [Math.sin(s * 21) * 0.005 * ws, Math.sin(s * 17 + 1) * 0.003 * ws, Math.sin(s * 19 + 2) * 0.005 * ws]);
    return { pom: add3(crown, push), hip: toWorld(R, M, M.hip), fl: [M.head[2], M.head[0]], yaw: R.yaw, w };
  };
  const sp = [{ k: "pom", f: 3.0, z: 0.22 }, { k: "hip", f: 2.4, z: 0.28, as: "pack" }, { k: "hip", f: 1.6, z: 0.16, as: "mug" }, { k: "fl", f: 3.6, z: 0.3 }];
  const d0 = drive(s0), X = sp.map((c) => d0[c.k].slice()), Vv = sp.map((c) => d0[c.k].map(() => 0));
  for (let s = s0; s < u; s += dt) {
    const d = drive(s);
    sp.forEach((c, i) => { const w = 2 * Math.PI * c.f, tg = d[c.k]; for (let j = 0; j < tg.length; j++) { const a = w * w * (tg[j] - X[i][j]) - 2 * c.z * w * Vv[i][j]; Vv[i][j] += a * dt; X[i][j] += Vv[i][j] * dt; } });
  }
  const dn = drive(u), off = (i) => X[i].map((x, j) => x - dn[sp[i].k][j]);
  const pk = rotY(off(1), -dn.yaw), mg = rotY(off(2), -dn.yaw), fl = off(3);
  let pom = off(0); const pl = len3(pom); if (pl > 0.03) pom = mul3(pom, 0.03 / pl);
  return { pom, pack: [clamp(pk[0], -0.015, 0.015), clamp(pk[1], -0.016, 0.016), clamp(pk[2], -0.015, 0.015)], mug: [clamp(mg[2] * 22, -0.9, 0.9), clamp(-mg[0] * 22, -0.9, 0.9)], flop: [clamp(fl[0], -0.5, 0.5), clamp(fl[1], -0.5, 0.5)], wind: dn.w };
}

/** Two-bone IK: hip, ankle (arrays), lengths, pole direction -> knee (+ stretch factor). */
function ik(A, B, l1, l2, pole) {
  const d = sub3(B, A), L = len3(d), dir = mul3(d, 1 / (L || 1));
  let s = 1; if (L > (l1 + l2) * 0.995) s = Math.min(1.15, L / ((l1 + l2) * 0.995));
  l1 *= s; l2 *= s;
  const Lc = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(L, (l1 + l2) * 0.999));
  const a = (l1 * l1 - l2 * l2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pp = sub3(pole, mul3(dir, dot3(pole, dir))); pp = len3(pp) < 1e-6 ? [0, 0, -1] : norm3(pp);
  return add3(add3(A, dir, a), pp, h);
}

export default {
  async create(ctx) {
    const P = buildModel(ctx);
    const spec0 = ctx.shot?.kiwi;
    const D0 = spec0 ? PO.prep(spec0, ctx.shot, ctx.heightAt) : null;
    const hasBeanie = !D0 || D0.beanie0 || D0.land.length > 0;
    P.beanie.visible = hasBeanie; P.pom.visible = hasBeanie;
    P.snow.visible = !!(D0 && D0.snow.length);
    for (const b of P.boots) setBow(b, [1, 1]);
    const st = { contacts: [], A: {} };
    const tmp = new THREE.Vector3(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

    function update(t, t2, spec, c) {
      if (!spec) return;
      const hAt = c.heightAt ?? (() => 0);
      const D = PO.prep(spec, c.shot, hAt); ensureFlight(D, hAt);
      const R = PO.rootAt(D, t, hAt);
      const Mo = PO.macro(D, t2, R), Ms = PO.macro(D, t, R, { gait: false, stab: true });
      const F = PO.feetAt(D, t, t2, hAt);
      const S = secondary(D, t2, hAt);
      // slope: lower the hips a little and follow the slope with the body
      const e = 0.05, gx = (hAt(R.x + e, R.z) - hAt(R.x - e, R.z)) / (2 * e), gz = (hAt(R.x, R.z + e) - hAt(R.x, R.z - e)) / (2 * e);
      const gF = gx * Math.sin(R.yaw) + gz * Math.cos(R.yaw), slope = Math.hypot(gx, gz);
      // root, lean, body, head
      P.rootG.position.set(R.x, R.y, R.z); P.rootG.rotation.set(0, R.yaw, 0);
      P.leanG.quaternion.setFromAxisAngle(tmp.set(...Mo.leanAxis), Mo.lean);
      P.hips.position.set(Mo.hip[0], Mo.hip[1] - 0.06 * slope, Mo.hip[2]); P.hips.rotation.set(Mo.rot[0] - 0.4 * Math.atan(gF), Mo.rot[1], Mo.rot[2], "YXZ");
      P.bodyS.scale.set(...Mo.sq);
      P.head.position.set(Mo.headPos[0], Mo.headPos[1] - 0.06 * slope, Mo.headPos[2]); P.head.rotation.set(Mo.head[0], Mo.head[1], Mo.head[2], "YXZ");
      P.tuft.scale.set(1, Mo.tuft, 1);
      P.pack.position.set(PACK_POS[0] + S.pack[0] * 0.5, PACK_POS[1] + S.pack[1] + (Mo.sq[1] - 1) * 0.22, PACK_POS[2] + S.pack[2] * 0.6);
      P.pack.rotation.set(PACK_RX - S.pack[2] * 3 + S.pack[1] * 2, 0, S.pack[0] * 3);
      const wl = rotY(S.wind, -R.yaw);
      P.mugPivot.rotation.set(S.mug[0] + 0.25 * wl[2] * 0.3, 0, S.mug[1] - 0.25 * wl[0] * 0.3 + 0.05 * Math.sin(t2 * 9) * len3(S.wind) * 0.3);
      // boots (world)
      F.forEach((f, i) => { const g = P.boots[i].g; g.position.set(f.x, f.y, f.z); g.rotation.set(f.pitch, f.yaw, f.roll, "YXZ"); });
      P.top.updateMatrixWorld(true);
      // neck tube (leanG space): from inside the body through the socket to the head centre
      const sockIn = v3(sub3(SOCK, BC)).add(tmp.set(0, -0.035, -0.05)).applyMatrix4(P.bodyS.matrix).applyMatrix4(P.hips.matrix);
      const sock = v3(sub3(SOCK, BC)).applyMatrix4(P.bodyS.matrix).applyMatrix4(P.hips.matrix);
      const hc = P.head.position.clone(), hf = new THREE.Vector3(0, -0.006, -0.012).applyEuler(P.head.rotation).add(hc);
      const mid = sock.clone().lerp(hf, 0.5).add(tmp.set(0, 0.006, 0));
      const np = resample([arr(sockIn), arr(sock), arr(mid), arr(hf)], 7);
      P.neck.set(smoothPts(np, 1), [0.05, 0.052, 0.05, 0.047, 0.044, 0.041, 0.038], { up: [1, 0, 0] });
      // legs: 2-bone IK in world space, bird heel joint pointing back
      const fwd = [Math.sin(R.yaw), 0, Math.cos(R.yaw)], side = [Math.cos(R.yaw), 0, -Math.sin(R.yaw)];
      F.forEach((f, i) => {
        const sg = i === 0 ? 1 : -1;
        const hip = arr(v3(HIPJ[i]).applyMatrix4(P.hips.matrixWorld)), hipIn = arr(v3(add3(HIPJ[i], [0, 0.03, -0.01])).applyMatrix4(P.hips.matrixWorld));
        const bm = P.boots[i].g.matrixWorld, ank = arr(v3(ANKLE).applyMatrix4(bm)), ankIn = arr(v3(add3(ANKLE, [0, -0.016, 0.002])).applyMatrix4(bm));
        const knee = ik(hip, ank, LEG[0], LEG[1], add3(add3(mul3(fwd, -1), side, 0.12 * sg), UP, 0.12));
        const pts = smoothPts(resample([hipIn, hip, knee, ank, ankIn], 14), 2, 0.45);
        P.legs[i].set(pts, pts.map((_, j) => { const v = j / 13; return v < 0.5 ? lerp(0.036, 0.0185, Math.pow(v / 0.5, 0.8)) : lerp(0.0185, 0.0165, (v - 0.5) / 0.5); }), { up: fwd });
      });
      // eyes
      for (const m of P.eyeMats) { const U = m.uniforms, E = Mo.eye; U.uLid.value = clamp(E.lid); U.uLidL.value = E.lidL; U.uPupil.value = E.pupil; U.uGlint.value = E.glint; U.uGlintRot.value = E.glintRot; U.uHappy.value = E.happy; U.uGaze.value.set(E.gx, E.gy); }
      // beanie + pompom
      const bmode = PO.beanieMode(D, t2);
      if (P.beanie.visible) {
        if (bmode.mode === "off" || bmode.mode === "land") { const f = flight(D, bmode); P.beanie.matrix.compose(f.pos, f.quat, sc.set(1, 1, 1)); }
        else {
          const since = bmode.since ?? -1, sqz = since >= 0 ? 1 - 0.28 * Math.exp(-since * 6) * Math.cos(2 * Math.PI * 3 * since) : 1;
          const quiv = (bmode.quiver ?? 0) * 0.07 * Math.sin(t2 * 47);
          const flop = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-S.flop[1] * 0.7 + quiv, 0, -S.flop[0] * 0.7 + quiv * 0.6, "XYZ"));
          P.beanie.matrix.copy(P.head.matrixWorld).multiply(BEANIE_L).multiply(flop).multiply(mtx.makeScale(1 + (1 - sqz) * 0.5, sqz, 1 + (1 - sqz) * 0.5));
        }
        P.beanie.matrixWorld.copy(P.beanie.matrix); for (const ch of P.beanie.children) ch.updateMatrixWorld(true);
        P.beanie.matrix.decompose(tmp, q, sc);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), crown = TOPV.clone().applyMatrix4(P.beanie.matrix);
        P.pom.position.copy(crown).addScaledVector(up, 0.021).add(v3(S.pom).multiplyScalar(0.85)); P.pom.quaternion.copy(q);
        P.pom.updateMatrixWorld(true);
        P.snow.scale.setScalar(Math.max(0.001, Mo.snow));
      }
      // bow on the right boot: loose, grabbed by the beak, snapped tight
      if (Mo.tie) {
        const T = Mo.tie, bt = v3(BEAK_TIP).applyMatrix4(P.head.matrixWorld).applyMatrix4(mtx.copy(P.boots[1].g.matrixWorld).invert());
        setBow(P.boots[1], T.size, T.grab > 0 ? { k: T.grab * T.w, p: arr(bt) } : null, T.flop);
      } else if (D.tie.length) setBow(P.boots[1], [1, 1]);
      // strap tails flutter
      P.pack.matrixWorld.decompose(tmp, q, sc);
      const wp = v3(S.wind).applyQuaternion(q.clone().invert()), ws = len3(S.wind);
      for (const [k, tl] of P.tails.entries()) {
        const dir = norm3(add3([0, -1, 0.25], arr(wp), 0.9)), nrm = norm3(cross3(dir, [1, 0, 0])), pts = [];
        for (let j = 0; j < 8; j++) { const v = j / 7, wv = Math.sin(2 * Math.PI * 6.5 * t2 - 5 * v + k * 2) * 0.008 * v * Math.min(1.5, ws + 0.15); pts.push(add3(add3(tl.base, dir, 0.062 * v), nrm, wv)); }
        tl.tb.set(pts, pts.map(() => 0.0062), { up: [1, 0, 0], flat: 0.22 });
      }
      // outline weight from the kiwi's size on screen
      const cam = c.camera;
      if (cam) {
        const Hpx = c.renderer?.domElement?.height ?? 1080, th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const dist = Math.max(0.05, cam.position.distanceTo(tmp.set(...toWorld(R, Ms, add3(Ms.hip, eul(BC, Ms.rot))))));
        const px = clamp((0.5 / (2 * dist * th)) * Hpx * 0.0085, 1.3, 4.2), wv = (px * 2 * th) / Hpx;
        P.OUT.uniforms.uWidth.value = wv; P.OUTF.uniforms.uWidth.value = wv * 0.45;
      }
      // anchors + contacts
      const bodyW = toWorld(R, Ms, add3(Ms.hip, eul(BC, Ms.rot)));
      st.A.body = bodyW; st.A.root = [bodyW[0], hAt(bodyW[0], bodyW[2]), bodyW[2]];
      st.A.head = toWorld(R, Ms, Ms.headPos);
      st.A.eyeL = arr(v3(EYES[0].C).applyMatrix4(P.head.matrixWorld)); st.A.eyeR = arr(v3(EYES[1].C).applyMatrix4(P.head.matrixWorld));
      st.A.beakTip = arr(v3(BEAK_TIP).applyMatrix4(P.head.matrixWorld));
      st.A.pompom = P.beanie.visible ? arr(P.pom.position) : st.A.head;
      st.A.footL = [F[0].ax, hAt(F[0].ax, F[0].az), F[0].az]; st.A.footR = [F[1].ax, hAt(F[1].ax, F[1].az), F[1].az];
      st.A.pack = arr(v3(PACK_C).applyMatrix4(P.pack.matrixWorld));
      st.contacts = F.map((f, i) => ({ name: i ? "footR" : "footL", p: new THREE.Vector3(f.x, f.y, f.z), planted: f.planted }));
    }
    return {
      root: P.top, update,
      anchor(name) { const a = st.A[name] ?? st.A.root ?? [0, 0, 0]; return new THREE.Vector3(a[0], a[1], a[2]); },
      contacts: () => st.contacts,
      dispose() {},
    };
  },
};
