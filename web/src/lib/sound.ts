// Interface sounds, synthesised on the fly (Web Audio: no files to load). One small family of soft tones:
// a wooden "tock" for a tap, two rising notes to open, two falling to close, a bubble for a place on the map,
// a low thud when the sheet settles, a sparkle for a reaction, a warm chord when a note is signed, a breath of
// air for the camera shows, a chime to go in, and a far ping when Ewan lands on the map.
// They are quiet, short, never more than one at a time, follow the iPhone's silent switch (an "ambient" audio
// session: they never stop the visitor's music either), and can be turned off.
import { signal } from "@preact/signals";

export type Sfx = "tap" | "open" | "close" | "pop" | "snap" | "on" | "off" | "react" | "signed" | "whoosh" | "enter" | "ping";

const KEY = "sound-v1";
function initialOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch (_) { return true; }
}
/** the visitor's choice (on by default) */
export const soundOn = signal(initialOn());
export function setSound(on: boolean) {
  soundOn.value = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) { /* ignore */ }
  if (on) play("on");
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): Ctx | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    // Safari 16.4+: like the keyboard clicks, mixed with other audio and silenced by the silent switch
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s) s.type = "ambient";
  } catch (_) { /* not there */ }
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch (_) { return null; }
  master = ctx.createGain();
  master.gain.value = 0.9;
  // a gentle limiter so two sounds never add up to a loud one
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.6), ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** A tone: a frequency glide and a quick swell then decay (seconds, Hz, 0..1). */
function tone(at: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = "sine", attack = 0.004) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.9);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** A breath of noise through a moving band-pass (a click when short, air when long). */
function air(at: number, dur: number, f0: number, f1: number, gain: number, q = 1.2) {
  const c = ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  f.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.05, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random() * 0.2);
  src.stop(at + dur + 0.02);
}

let last = 0;

/** Play an interface sound (nothing if turned off, hidden, or another just played). `pitch` shifts it (1 = as is). */
export function play(kind: Sfx, pitch = 1) {
  if (!soundOn.peek() || document.hidden) return;
  const now = performance.now();
  if (now - last < 45) return; // one gesture, one sound
  last = now;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume(); // allowed now: we are inside the tap
  const t = c.currentTime + 0.005;
  const p = pitch;
  switch (kind) {
    case "tap": // a soft wooden tock
      tone(t, 760 * p, 430 * p, 0.05, 0.11, "triangle", 0.002);
      air(t, 0.018, 3800, 2400, 0.035, 2);
      break;
    case "open": // two quick rising notes
      tone(t, 880 * p, 880 * p, 0.07, 0.07, "sine");
      tone(t + 0.055, 1318 * p, 1318 * p, 0.11, 0.065, "sine");
      break;
    case "close": // the same, falling
      tone(t, 1175 * p, 1175 * p, 0.06, 0.055, "sine");
      tone(t + 0.05, 784 * p, 784 * p, 0.1, 0.055, "sine");
      break;
    case "pop": // a bubble (higher for summits, lower for huts)
      tone(t, 320 * p, 980 * p, 0.09, 0.13, "sine", 0.003);
      tone(t + 0.012, 1960 * p, 1960 * p, 0.05, 0.02, "sine");
      break;
    case "snap": // the sheet settling: a low, soft thud
      tone(t, 190, 82, 0.09, 0.16, "sine", 0.003);
      air(t, 0.05, 900, 300, 0.03, 0.8);
      break;
    case "on":
      tone(t, 1046, 1046, 0.05, 0.06, "triangle");
      tone(t + 0.045, 1568, 1568, 0.07, 0.055, "triangle");
      break;
    case "off":
      tone(t, 1318, 1318, 0.05, 0.05, "triangle");
      tone(t + 0.045, 880, 880, 0.07, 0.05, "triangle");
      break;
    case "react": // a sparkle going up
      [1568, 2093, 2637, 3136].forEach((f, i) => tone(t + i * 0.035, f, f * 1.01, 0.16, 0.035, "sine"));
      tone(t, 300, 700, 0.07, 0.07, "sine", 0.003);
      break;
    case "signed": // a warm chord
      [523.25, 659.25, 783.99].forEach((f, i) => tone(t + i * 0.025, f, f, 0.55, 0.04, "triangle", 0.015));
      tone(t + 0.08, 1046.5, 1046.5, 0.5, 0.02, "sine", 0.02);
      break;
    case "whoosh": // air through the camera
      air(t, 0.5, 350, 2600, 0.07, 0.9);
      tone(t + 0.05, 220, 330, 0.4, 0.02, "sine", 0.08);
      break;
    case "enter": // a chime and a breath
      tone(t, 659.25, 659.25, 0.6, 0.06, "sine", 0.01);
      tone(t + 0.09, 987.77, 987.77, 0.75, 0.055, "sine", 0.01);
      tone(t + 0.09, 1975.5, 1975.5, 0.5, 0.012, "sine", 0.01);
      air(t, 0.7, 300, 1800, 0.035, 0.8);
      break;
    case "ping": // far away, like the ring on the map
      tone(t, 1568, 1568, 1.1, 0.045, "sine", 0.004);
      tone(t, 3136, 3136, 0.5, 0.01, "sine", 0.004);
      break;
  }
}

/**
 * Taps anywhere in the interface: a sound by what was touched. An element can say which with data-sfx
 * (or "none" when its own code plays something). Links open, close buttons close, switches and pressed
 * buttons say on or off, everything else taps.
 */
export function installTapSounds(root: Document = document) {
  root.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-sfx], button, a[href], [role=button], input[type=checkbox], summary");
    if (!el) return;
    const want = el.getAttribute("data-sfx");
    if (want === "none") return;
    if (want) { play(want as Sfx); return; }
    if (el instanceof HTMLInputElement && el.type === "checkbox") { play(el.checked ? "on" : "off"); return; }
    const pressed = el.getAttribute("aria-pressed");
    if (pressed !== null && !el.closest(".seg")) { play(pressed === "true" ? "off" : "on"); return; } // (the state flips after this)
    if (el instanceof HTMLAnchorElement) { play(el.target === "_blank" ? "tap" : "open"); return; }
    play("tap");
  }, true);
}
