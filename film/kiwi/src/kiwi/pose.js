// Kiwi animation as pure functions of time. rootAt / feetAt run on ones (t), macro (body, head, eyes) on twos (t2).
// Gait: a footfall every half beat on the absolute beat grid (t = n * BEAT/2; even n = left foot), so the walk grooves
// with the 90 BPM score in every shot. Planted feet are fixed world points (no sliding by construction).
import { BEAT, noise1, hash } from "../core/time.js";
import { clamp, lerp, sstep, smoother, wrapA, ring, backOut, easeOut, rotX, rotY, eul, add3, norm3 } from "./util.js";
import { SOCK, BC, BEAK_TIP, BOW, BOOT_S } from "./model.js";

export const CALM = 0.7;   // half-lidded, unbothered
export const H = BEAT / 2, SW = 0.25, ST = 2 * H - SW, HW = 0.046, LIFT = 0.034;
const D2R = Math.PI / 180;
export const STAND = { hip: [0, 0.185, 0], rot: [0.05, 0, 0], sq: [1, 1, 1], neck: [0, 0.042, 0.08], head: [0.12, 0, 0] };
export const SIT = { hip: [0, 0.098, -0.11], rot: [-0.08, 0, 0], sq: [1.03, 0.96, 1.0], neck: [0, 0.05, 0.072], head: [0.1, 0, 0] };
const TIE = { hip: [-0.008, 0.094, -0.1], rot: [0.24, -0.14, 0.05], sq: [1.03, 0.95, 1.0] };
const KEYS = ["hip", "rot", "sq", "neck", "head"];

// ------------------------------------------------------------------------------------------------ preparation
const CACHE = new WeakMap();
function walkDesc(w, shotT0, yawS) {
  const fx = w.from?.[0] ?? 0, fz = w.from?.[1] ?? 0, dx = w.to[0] - fx, dz = w.to[1] - fz, L = Math.hypot(dx, dz);
  const dir = L > 1e-6 ? [dx / L, dz / L] : [Math.sin(yawS), Math.cos(yawS)];
  const yawP = Math.atan2(dir[0], dir[1]);
  const ease = w.t0 > shotT0 + 0.02;                    // starts inside the shot: from standing, eased first step
  const o = { act: w, t0: w.t0, t1: w.t1, from: [fx, fz], dir, L, yawP, yawS: yawS ?? yawP, ease, lean: (w.lean ?? 0) * D2R, te: H };
  if (ease) { o.n1 = Math.ceil((w.t0 - 0.02 + SW) / H - 1e-9); o.tau0 = o.n1 * H - SW; o.v = L / Math.max(0.3, w.t1 - o.tau0 - o.te / 2); }
  else { o.n1 = -1e9; o.tau0 = w.t0; o.v = L / Math.max(0.05, w.t1 - w.t0); }
  return o;
}
export function prep(spec, shot, hAt) {
  const c = CACHE.get(spec); if (c && c.shot === shot) return c;
  const acts = (spec.acts ?? []).slice().sort((a, b) => (a.t0 ?? a.t ?? 0) - (b.t0 ?? b.t ?? 0));
  const by = (n) => acts.filter((a) => a.do === n);
  const shotT0 = shot?.t0 ?? Math.min(0, ...acts.map((a) => a.t0 ?? a.t ?? 0));
  let yawS = spec.yaw != null ? spec.yaw * D2R : null;
  const w0 = by("walk");
  if (yawS == null) { const w = w0[0]; yawS = w ? Math.atan2(w.to[0] - (w.from?.[0] ?? 0), w.to[1] - (w.from?.[1] ?? 0)) : Math.PI / 2; }
  const D = {
    spec, shot, shotT0, at: spec.at ?? [0, 0], yawStand: yawS, walks: w0.map((w) => walkDesc(w, shotT0, yawS)),
    sit: by("sit"), tie: by("tie"), stand: by("stand"), settle: by("settle"), idle: by("idle"), blink: by("blink"),
    look: by("lookUp"), step: by("step"), off: by("beanieOff"), land: by("beanieLand"), snow: by("snowHat"),
    wind: spec.wind ?? null, windFx: (shot?.fx ?? []).filter((f) => f.type === "wind"), beanie0: spec.beanie !== false,
  };
  D.standFeet = [0, 1].map((i) => { const sg = i === 0 ? 1 : -1; return { x: D.at[0] + Math.cos(yawS) * sg * HW, z: D.at[1] - Math.sin(yawS) * sg * HW, yaw: yawS + sg * 0.1 }; });
  // right boot's bow in root-local space (for the tie)
  const fr = D.standFeet[1], dh = hAt ? hAt(fr.x, fr.z) - hAt(D.at[0], D.at[1]) : 0, bw = rotY(BOW.map((x) => x * BOOT_S), -0.1);
  D.bowR = [-HW + bw[0], dh + bw[1], bw[2]];
  CACHE.set(spec, D); return D;
}

// ------------------------------------------------------------------------------------------------ walk path (ones)
export function curWalk(D, t) { let c = null; for (const w of D.walks) if (t >= w.t0) c = w; return c ?? D.walks[0] ?? null; }
export function wS(w, t) {
  if (!w.ease) return Math.min(w.L, w.v * (t - w.t0));
  const u = t - w.tau0; if (u <= 0) return 0;
  return Math.min(w.L, u < w.te ? 0.5 * w.v / w.te * u * u : w.v * w.te / 2 + w.v * (u - w.te));
}
export function wK(w, t) { if (t > w.t1 + 0.02) return 0; if (!w.ease) return 1; const u = t - w.tau0; return u <= 0 ? 0 : Math.min(1, u / w.te); }
export function wYaw(w, t) { return w.ease ? w.yawS + wrapA(w.yawP - w.yawS) * smoother((t - w.tau0 + 0.06) / 0.42) : w.yawP; }
export function rootAt(D, t, hAt) {
  const w = curWalk(D, t);
  let x = D.at[0], z = D.at[1], yaw = D.yawStand;
  if (w) { const s = wS(w, t); x = w.from[0] + w.dir[0] * s; z = w.from[1] + w.dir[1] * s; yaw = wYaw(w, t); }
  return { x, z, yaw, y: hAt ? hAt(x, z) : 0 };
}

// ------------------------------------------------------------------------------------------------ feet (ones; swing on twos)
function plantPos(w, n, i) {
  const tn = n * H, s = wS(w, tn + ST / 2), yaw = wYaw(w, tn), sg = i === 0 ? 1 : -1;
  return { x: w.from[0] + w.dir[0] * s + Math.cos(yaw) * sg * HW, z: w.from[1] + w.dir[1] * s - Math.sin(yaw) * sg * HW, yaw: yaw + sg * 0.06 };
}
function slopeTilt(x, z, yaw, hAt) {
  const e = 0.02, gx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), gz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
  const f = gx * Math.sin(yaw) + gz * Math.cos(yaw), s = gx * Math.cos(yaw) - gz * Math.sin(yaw);
  return [-Math.atan(f), Math.atan(s)];
}
function planted(p, hAt) { const y = hAt(p.x, p.z), [pi, ro] = slopeTilt(p.x, p.z, p.yaw, hAt); return { x: p.x, y, z: p.z, yaw: p.yaw, pitch: pi, roll: ro, planted: true, ax: p.x, az: p.z }; }
function swing(A, B, k, kA, lift, hAt) {
  const hp = (1 - Math.cos(Math.PI * k)) / 2, x = lerp(A.x, B.x, hp), z = lerp(A.z, B.z, hp);
  let y = lerp(hAt(A.x, A.z), hAt(B.x, B.z), hp) + lift * Math.sin(Math.PI * Math.pow(k, 0.85));
  y = Math.max(y, hAt(x, z) + 0.003 * Math.sin(Math.PI * k));
  const ha = smoother(kA);
  return { x, y, z, yaw: A.yaw + wrapA(B.yaw - A.yaw) * hp, pitch: 0.32 * Math.sin(Math.PI * k) * (1 - 2 * k), roll: 0, planted: false, ax: lerp(A.x, B.x, ha), az: lerp(A.z, B.z, ha) };
}
function stepFoot(D, a, stand, t, tS, hAt) {
  const yaw = D.yawStand, f = [Math.sin(yaw), Math.cos(yaw)], len = a.len ?? 0.16;
  const E = { x: stand.x + f[0] * len, z: stand.z + f[1] * len, yaw: stand.yaw };
  const t0 = a.t0, P = a.plant, T = Math.max(0.2, P - t0);
  if (t < t0) return planted(stand, hAt);
  if (t >= P) return planted(E, hAt);
  const uS = clamp((tS - t0) / T), u1 = (t - t0) / T, s0 = 0.86;
  let fw, lift, pitch;
  if (u1 >= s0) { const k = (u1 - s0) / (1 - s0); fw = lerp(0.42, 1, k); lift = 0.078 * (1 - Math.pow(k, 1.4)); pitch = 0.3 * (1 - k); }   // the slam, on ones
  else if (uS < 0.6) { const e = easeOut(uS / 0.6); fw = 0.3 * e; lift = 0.07 * e; pitch = 0.42 * e; }
  else { const e = sstep(0.6, s0, uS); fw = 0.3 + 0.12 * e; lift = 0.07 + 0.008 * e; pitch = 0.42 - 0.12 * e; }
  const x = stand.x + f[0] * len * fw, z = stand.z + f[1] * len * fw, ha = smoother(u1);
  return { x, y: Math.max(hAt(x, z) + lift, hAt(x, z)), z, yaw: stand.yaw, pitch, roll: 0, planted: false, ax: lerp(stand.x, E.x, ha), az: lerp(stand.z, E.z, ha) };
}
export function feetAt(D, t, tS, hAt) {
  return [0, 1].map((i) => {
    const stand = D.standFeet[i];
    const st = D.step.find((a) => (a.foot ?? "L") === (i === 0 ? "L" : "R"));
    if (st) return stepFoot(D, st, stand, t, tS, hAt);
    const w = curWalk(D, t);
    if (!w) return planted(stand, hAt);
    let nL = Math.floor(t / H + 1e-9); if ((((nL - i) % 2) + 2) % 2 !== 0) nL -= 1;
    const nN = nL + 2, first = w.ease ? ((((w.n1 - i) % 2) + 2) % 2 === 0 ? w.n1 : w.n1 + 1) : -1e9;
    const posOf = (n) => (n < first ? stand : plantPos(w, n, i));
    if (nN < first || nN * H > w.t1 + SW) return planted(posOf(nL), hAt);
    const ts0 = nN * H - SW;
    if (t >= ts0) { const sw = swing(posOf(nL), posOf(nN), clamp((tS - ts0) / SW), clamp((t - ts0) / SW), LIFT * (0.6 + 0.4 * Math.min(1, w.v / 0.45)), hAt); return sw; }
    return planted(posOf(nL), hAt);
  });
}

// ------------------------------------------------------------------------------------------------ wind
export function gustAt(D, u) { let g = 0; for (const f of D.windFx) if (f.gust != null) g = Math.max(g, (f.strength ?? 1) * sstep(f.gust - 0.12, f.gust + 0.03, u) * Math.exp(-Math.max(0, u - f.gust - 0.1) / 0.6)); return g; }
export function windAt(D, u) {
  let w = D.wind ? D.wind.slice() : [0, 0, 0];
  for (const f of D.windFx) if (f.spiral) { const s = f.strength ?? 1; w = add3(w, [Math.cos(u * 1.3) * 0.6 * s, 0.1 * s, Math.sin(u * 1.3) * 0.6 * s]); }
  const g = gustAt(D, u); if (g > 0) { const d = D.windFx.find((f) => f.gust != null)?.dir ?? D.wind ?? [1, 0, 0]; w = add3(w, norm3(d), 1.6 * g); }
  return w;
}

// ------------------------------------------------------------------------------------------------ body, head, eyes (twos)
export function beanieMode(D, u) {
  const off = D.off[0], land = D.land[0];
  if (land) return u < land.t1 ? { mode: "land", k: land.t1 - u, a: land } : { mode: "on", since: u - land.t1, a: land };
  if (off && u >= off.t0) return { mode: "off", k: u - off.t0, a: off };
  return D.beanie0 ? { mode: "on", quiver: off ? sstep(off.t0 - 0.35, off.t0, u) : 0 } : { mode: "hidden" };
}
function tieState(D, a, u) {
  const rel = u - a.t0, dur = a.t1 - a.t0, pulls = (a.pull ?? []).slice().sort((x, y) => x - y);
  const w = sstep(0, 0.42, rel) * (1 - sstep(dur - 0.62, dur - 0.04, rel));
  let tgt = add3(D.bowR, [0, 0.011, 0.002]), grab = 0, size = [1.35, 1.3], pre = 0, after = -1, happy = 0;
  for (const p of pulls) {
    if (u < p && u >= p - 0.45) pre = clamp((u - (p - 0.45)) / 0.45);
    if (u >= p) after = u - p;
  }
  let work = 1;
  if (pre > 0) { tgt = add3(tgt, [-0.003 * pre, 0.034 * pre * pre, -0.02 * pre * pre]); grab = sstep(0, 0.12, pre); size = [1.35, 1.3 - 0.25 * pre]; work = 1 - sstep(0, 0.2, pre); }
  else if (after >= 0) {
    const rec = 0.034 + 0.03 * sstep(0, 0.14, after) - 0.012 * ring(after, 3, 0.4);
    tgt = add3(tgt, [-0.003, rec, -0.02]); const r = ring(after, 4.5, 0.28); size = [1 - 0.32 * r, 1 - 0.28 * r]; work = 0;
    happy = sstep(0.08, 0.2, after) * (1 - sstep(0.85, 1.1, after));
  }
  const jig = [0.0025 * noise1(u * 6, 1), 0.004 * Math.abs(noise1(u * 7, 2)), 0.0025 * noise1(u * 6, 3)];
  tgt = add3(tgt, jig, work);
  const rot = [1.2 + 0.06 * noise1(u * 4, 6) * work - (after >= 0 ? 0.18 * sstep(0, 0.2, after) : 0), -0.3, 0.12 + 0.07 * noise1(u * 3, 5) * work];
  return { w, tgt, rot, grab, size, flop: after >= 0 ? ring(after, 3, 0.3) : 0, happy, pre, after };
}
/** Body/head/eye pose at u. R = root at (about) u. opts.gait=false: no walk oscillation (stabilised anchors). */
export function macro(D, u, R, { gait = true, stab = false } = {}) {
  const o = { eye: { lid: CALM, lidL: 0.06, gx: 0, gy: -0.1, pupil: 1, glint: 0, glintRot: u * 0.7, happy: 0 }, lean: 0, leanAxis: [1, 0, 0], tie: null, snow: 0, tuft: 1 };
  // sit -> stand
  let wSit = 0, antic = 0, stretch = 0, wob = 0;
  const st = D.stand[0];
  if (st) {
    if (u < st.t0) wSit = 1;
    else if (stab) wSit = 1 - smoother((u - st.t0) / (st.t1 - st.t0));
    else { const v = (u - st.t0) / (st.t1 - st.t0); wSit = 1 - (v < 0.3 ? 0 : backOut((v - 0.3) / 0.34, 2.2)); antic = v < 0.36 ? Math.sin(Math.PI * v / 0.36) : 0; stretch = Math.exp(-(((v - 0.5) / 0.1) ** 2)); wob = ring(u - (st.t0 + 0.64 * (st.t1 - st.t0)), 3.2, 0.3); }
  } else if (D.sit.length || D.tie.length) wSit = 1;
  for (const k of KEYS) o[k] = STAND[k].map((x, i) => lerp(x, SIT[k][i], wSit));
  o.hip[1] -= 0.016 * antic; o.hip[2] += 0.03 * antic; o.rot[0] += 0.34 * antic; o.head[0] += 0.2 * antic;
  o.sq[0] += 0.05 * antic - 0.035 * stretch; o.sq[1] += -0.07 * antic + 0.075 * stretch + 0.035 * wob; o.sq[2] += 0.02 * antic - 0.02 * stretch;
  // tie
  const tie = D.tie.find((a) => u >= a.t0 - 0.01 && u <= a.t1 + 0.3);
  let tieW = 0;
  if (tie) {
    const T = tieState(D, tie, u); tieW = T.w; o.tie = T;
    for (const k of ["hip", "rot", "sq"]) o[k] = o[k].map((x, i) => lerp(x, TIE[k][i], T.w));
    o.eye.gy = lerp(-0.1, -0.3, T.w); o.eye.lid = lerp(CALM, 0.4, T.w);
    if (T.happy > 0) { o.eye.lid = lerp(o.eye.lid, 0.92, T.happy); o.eye.happy = T.happy; o.eye.lidL = 0.25 * T.happy; }
  }
  // walk
  const w = curWalk(D, u); let walkK = 0, gOff = [0, 0, 0];
  if (w) {
    walkK = wK(w, u);
    o.rot[0] += 0.06 * walkK; o.head[0] -= 0.03 * walkK;
    if (gait && walkK > 0) {
      const ph = u / H, c2 = Math.cos(2 * Math.PI * (ph - 0.12)), c1 = Math.cos(Math.PI * (ph - 0.45)), s1 = Math.sin(Math.PI * (ph - 0.45)), k = walkK * (0.75 + 0.25 * Math.min(1.3, w.v / 0.45));
      gOff = [0.007 * k * c1, -0.009 * k * c2, 0];
      o.hip[0] += gOff[0]; o.hip[1] += gOff[1];
      o.rot[2] += -0.05 * k * c1; o.rot[1] += 0.04 * k * s1; o.rot[0] += 0.015 * k * c2;
      const pc = Math.max(0, c2); o.sq[1] -= 0.022 * k * pc; o.sq[0] += 0.011 * k * pc; o.sq[2] += 0.008 * k * pc;
      o.neck[2] += 0.006 * k * Math.sin(2 * Math.PI * (ph - 0.3));
    }
    if (w.lean) {
      o.lean = w.lean * (w.ease ? walkK : 1) * (u <= w.t1 + 0.02 ? 1 : 0) + 0.03 * gustAt(D, u);
      const wd = D.wind ?? [-Math.sin(R.yaw), 0, -Math.cos(R.yaw)];
      const l = rotY([wd[0], 0, wd[2]], -R.yaw), d = norm3([-l[0], 0, -l[2]]);
      o.leanAxis = norm3([d[2], 0, -d[0]]);
    }
  }
  // breathing (head stays put: birds stabilise their heads)
  const idle = D.idle.find((a) => u >= a.t0 - 0.01 && u <= a.t1 + 0.01), calm = !!idle?.calm;
  const br = stab ? 0 : Math.sin(2 * Math.PI * 0.3 * u + 1) * (1 - 0.7 * walkK);
  o.sq[1] += 0.012 * br; o.sq[0] -= 0.004 * br; o.sq[2] -= 0.003 * br; o.hip[1] += 0.0015 * br;
  // settle: quick head wiggle, eyes squeezed
  for (const a of stab ? [] : D.settle) {
    const v = u - a.t0, d = a.t1 - a.t0; if (v < 0 || v > d + 0.8) continue;
    const env = sstep(0, 0.05, v) * Math.exp(-3.8 * v), wig = Math.sin(2 * Math.PI * 4.6 * v) * env;
    o.head[2] += 0.3 * wig; o.head[1] += 0.07 * Math.sin(2 * Math.PI * 4.6 * v + 1.2) * env; o.neck[1] += 0.004 * Math.abs(wig);
    const sq = sstep(0, 0.06, v) * (1 - sstep(d * 0.6, d, v)); o.eye.lid = lerp(o.eye.lid, 0.95, sq); o.eye.happy = Math.max(o.eye.happy, sq); o.eye.lidL = Math.max(o.eye.lidL, 0.3 * sq);
    o.sq[1] += 0.02 * ring(v, 5, 0.3);
  }
  // look up
  let lk = null, prevDeg = 0, look = 0, wide = 0, glint = 0;
  for (const a of D.look) { if (u >= a.t0) { if (lk) prevDeg = lk.deg; lk = a; } }
  if (!lk && D.look[0]?.from != null) { look = D.look[0].from * D2R; wide = look > 0.05 ? 1 : 0; glint = wide; }
  if (lk) {
    const from = (lk.from ?? prevDeg) * D2R, to = lk.deg * D2R, v = clamp((u - lk.t0) / Math.max(0.05, lk.t1 - lk.t0));
    look = lerp(from, to, smoother(v));
    if (to > 0.05 && from >= to - 0.01) { wide = 1; glint = 1; }
    else if (to > from) { wide = sstep(0.04, 0.36, v); glint = v < 0.55 ? 0 : backOut((v - 0.55) / 0.25, 2.6); }
    else { wide = 1 - sstep(0, 0.7, v); glint = 1 - sstep(0, 0.4, v); }
  }
  o.head[0] -= look; o.neck[1] += 0.016 * (look / 0.61); o.neck[2] -= 0.01 * (look / 0.61);
  o.eye.lid = lerp(o.eye.lid, 0.0, wide); o.eye.lidL *= 1 - wide; o.eye.gy += 0.32 * wide; o.eye.pupil = lerp(1, 0.8, wide); o.eye.glint = glint;
  const lookW = clamp(Math.abs(look) / 0.3);
  // bird-like head snaps (not when calm, tying, looking up or walking)
  const micro = (calm || stab ? 0 : idle || wSit > 0.5 ? (wSit > 0.5 ? 0.7 : 1) : 0) * (1 - lookW) * (1 - tieW) * (1 - walkK);
  if (micro > 0) {
    const k = (u + 0.37) / 1.5, seg = Math.floor(k), f = k - seg, m = smoother(f / 0.14);
    const tg = (s) => [(hash(s, 1) - 0.5) * 0.14, (hash(s, 2) - 0.5) * 0.32, (hash(s, 3) - 0.5) * 0.12];
    const A = tg(seg - 1), B = tg(seg); for (let i = 0; i < 3; i++) o.head[i] += lerp(A[i], B[i], m) * micro;
  }
  // the heroic step
  for (const a of stab ? [] : D.step) {
    const P = a.plant, t0 = a.t0, T = P - t0, sg = (a.foot ?? "L") === "L" ? -1 : 1;
    const pre = sstep(t0 - 0.12, t0 + 0.35 * T, u) * (1 - sstep(P, P + 0.4, u));
    o.hip[0] += 0.016 * sg * pre; o.rot[2] += -0.06 * sg * pre; o.hip[1] += 0.008 * sstep(t0, t0 + 0.5 * T, u) * (u < P ? 1 : 0);
    const d = u - P;
    if (d >= 0) {
      const imp = Math.exp(-d * 5.5) * Math.cos(2 * Math.PI * 2.6 * d);
      o.hip[1] -= 0.03 * imp; o.sq[0] += 0.07 * imp; o.sq[1] -= 0.12 * imp; o.sq[2] += 0.05 * imp;
      o.hip[2] += (a.len ?? 0.16) * 0.45 * easeOut(d / 0.45); o.head[0] += 0.08 * imp;
    }
  }
  // blinks
  for (const b of D.blink) {
    const [cl, hd, op] = b.slow ? [0.22, 0.12, 0.34] : [0.09, 0.09, 0.13], x = u - b.t; let k = 0;
    if (x >= -cl - hd / 2 && x < -hd / 2) k = smoother((x + cl + hd / 2) / cl); else if (Math.abs(x) <= hd / 2) k = 1; else if (x > hd / 2 && x < hd / 2 + op) k = 1 - smoother((x - hd / 2) / op);
    o.eye.lid = lerp(o.eye.lid, 1, k);
  }
  // snow cap, cowlick
  for (const a of D.snow) o.snow = Math.max(o.snow, sstep(a.t - 0.08, a.t + 0.12, u));
  const bm = beanieMode(D, u);
  if (bm.mode === "on") o.tuft = 0.5; else if (bm.mode === "off") { const dt = bm.k - 0.22; o.tuft = dt < 0 ? 0.5 : 1 - 0.5 * Math.exp(-dt * 9) * Math.cos(dt * 30); }
  // head position: socket (moves with the body) + neck, minus most of the body's oscillation
  o.sock = sockOf(o.hip, o.rot, o.sq);
  o.headPos = add3(o.sock, o.neck);
  const k = calm ? 1 : 0.65;
  o.headPos = add3(o.headPos, [gOff[0] * k, (gOff[1] + 0.0015 * br + 0.012 * br * (SOCK[1] - BC[1])) * k, 0], -1);
  if (o.tie && o.tie.w > 0) { const T = o.tie, hp = add3(T.tgt, eul(BEAK_TIP, T.rot), -1); o.headPos = o.headPos.map((x, i) => lerp(x, hp[i], T.w)); o.head = o.head.map((x, i) => lerp(x, T.rot[i], T.w)); }
  return o;
}
export function sockOf(hip, rot, sq) { const l = [BC[0] + (SOCK[0] - BC[0]) * sq[0], BC[1] + (SOCK[1] - BC[1]) * sq[1], BC[2] + (SOCK[2] - BC[2]) * sq[2]]; return add3(hip, eul(l, rot)); }
