// Timing, easing and deterministic randomness. Everything in the film is a pure function of t (seconds).
export const FPS = 24;
export const BPM = 90;
export const BEAT = 60 / BPM;          // 0.6667 s
export const BAR = BEAT * 4;           // 2.6667 s
/** Start time of bar b (1-based) plus beats (0-based, may be fractional). */
export const at = (bar, beat = 0) => (bar - 1) * BAR + beat * BEAT;
/** Character/FX animation "on twos": pose changes every 2 frames (12 drawings a second). */
export const twos = (t) => Math.floor(t * 12 + 1e-6) / 12;
export const threes = (t) => Math.floor(t * 8 + 1e-6) / 8;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
export const smoother = (k) => { k = clamp(k); return k * k * k * (k * (k * 6 - 15) + 10); };

export const ease = {
  linear: (k) => clamp(k),
  inOut: smoother,
  in: (k) => { k = clamp(k); return k * k * k; },
  out: (k) => { k = clamp(k); return 1 - (1 - k) ** 3; },
  /** Strong ease-out (weight landing). */
  outExpo: (k) => { k = clamp(k); return k >= 1 ? 1 : 1 - Math.pow(2, -10 * k); },
  inExpo: (k) => { k = clamp(k); return k <= 0 ? 0 : Math.pow(2, 10 * k - 10); },
  /** Overshoot then settle. */
  backOut: (k, s = 1.7) => { k = clamp(k) - 1; return k * k * ((s + 1) * k + s) + 1; },
  /** Pull back first (anticipation), then go. */
  backIn: (k, s = 1.7) => { k = clamp(k); return k * k * ((s + 1) * k - s); },
  /** Anticipate + overshoot, the classic weighted move. */
  backInOut: (k, s = 1.7 * 1.525) => { k = clamp(k) * 2; return k < 1 ? 0.5 * (k * k * ((s + 1) * k - s)) : 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2); },
  /** Damped spring settle from 0 to 1 (zeta < 1 overshoots). */
  spring: (k, freq = 3, zeta = 0.35) => {
    k = Math.max(0, k); const w = 2 * Math.PI * freq, wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * k) * (Math.cos(wd * k) + (zeta * w / wd) * Math.sin(wd * k));
  },
};

/** Piecewise keyframes: keys = [{u, v, e?}] (u = time, v = number|array, e = easing name into this key). */
export function keys(list, u) {
  if (u <= list[0].u) return list[0].v;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (u <= b.u) {
      const f = (ease[b.e || "inOut"])((u - a.u) / (b.u - a.u || 1));
      return Array.isArray(a.v) ? a.v.map((x, j) => lerp(x, b.v[j], f)) : lerp(a.v, b.v, f);
    }
  }
  return list[list.length - 1].v;
}

// ---- deterministic randomness ------------------------------------------------------------------
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += f(); return (u - 2) / 0.577; };
  return f;
}
/** Stable hash of numbers -> [0,1). */
export function hash(...n) {
  let h = 2166136261;
  for (const x of n) { h ^= Math.floor(x * 1000003) | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// value noise + fbm, 1D/2D, deterministic
const fade = (t) => t * t * (3 - 2 * t);
export function noise1(x, seed = 0) { const i = Math.floor(x), f = x - i; return lerp(hash(i, seed), hash(i + 1, seed), fade(f)) * 2 - 1; }
export function noise2(x, y, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}
export function fbm1(x, oct = 4, seed = 0) { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * noise1(x * f, seed + o * 17); a *= 0.5; f *= 2.03; } return s; }
export function fbm2(x, y, oct = 4, seed = 0) { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * noise2(x * f, y * f, seed + o * 17); a *= 0.5; f *= 2.03; } return s; }

/**
 * A damped spring driven by a target signal, simulated from t0 so the result depends on t only (deterministic,
 * any frame order). target(t) -> number. Returns the spring value at t.
 */
export function springFollow(target, t0, t, { freq = 2.5, zeta = 0.3, dt = 1 / 120 } = {}) {
  const w = 2 * Math.PI * freq; let x = target(t0), v = 0;
  for (let s = t0; s < t; s += dt) { const a = w * w * (target(s) - x) - 2 * zeta * w * v; v += a * dt; x += v * dt; }
  return x;
}
