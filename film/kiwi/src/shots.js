// THE SHOT LIST (director). 90 BPM, a bar = 2.667 s; at(bar, beat) gives the time of a beat. Every hit in the
// picture lands on the music: departments read times from here, never hard-code them.
//
// Story: a calm morning at Ship Cove; a kiwi tramper (oversized pack, blue beanie with an orange pompom) reties his
// laces. Behind him the South Island throws everything (storm, flood, sandflies, scree rain, avalanche, gale); each
// hit lands on the beat and he never notices. The storm drains into an indigo spiral around the sun. Silence. The wind
// takes his beanie; for the first time he looks up. One step: every orange trail triangle lights from Ship Cove to
// Bluff, the clouds open around the island, the first major chord. The beanie falls back; he walks on. "TA."
//
// Units: metres (S15 island: kilometres). Y up. Kiwi walks +X in side shots, cameras mostly on the +Z side looking
// toward -Z, so "behind him" = -Z. Kiwi yaw: degrees about Y, 0 = facing +Z (the camera), 90 = facing +X.
import { at, BEAT, BAR } from "./core/time.js";

/** Camera keys for both aspects. 9:16 defaults to the same path with a taller lens; pass k9 to frame it differently. */
function cam(k16, k9) {
  return { "16x9": k16, "9x16": k9 ?? k16.map((k) => ({ ...k, fov: k.fov * 1.6 })) };
}
const K = (name, off = [0, 0, 0]) => ({ kiwi: name, off });   // a point that follows a kiwi anchor
const walkSpeed = 0.45;                                        // m/s, 3 steps a second = a step every half beat

export const SHOTS = [
  // ------------------------------------------------------------------ ACT 1: calm
  {
    id: "S01", t0: at(1), t1: at(3), env: "cove", rig: "dawn",
    note: "Establishing. Dawn over Ship Cove: still water, bush hills, an orange trail triangle on a post. The kiwi sits by it, tiny in frame. Slow push in.",
    cam: cam([
      { t: at(1), pos: [-3.4, 1.35, 6.6], look: [0.3, 0.55, -1.6], fov: 30 },
      { t: at(3), pos: [-2.5, 1.0, 4.9], look: [0.25, 0.38, -0.6], fov: 30, e: "inOut" },
    ], [
      { t: at(1), pos: [-2.6, 1.6, 7.6], look: [0.2, 1.4, -1.6], fov: 50 },
      { t: at(3), pos: [-1.9, 1.15, 5.6], look: [0.2, 0.75, -0.6], fov: 50, e: "inOut" },
    ]),
    kiwi: { at: [0, 0], yaw: 35, beanie: true, acts: [{ do: "sit", t0: at(1), t1: at(3) }, { do: "blink", t: at(2, 1) }] },
    envOpts: { marker: [0.48, -0.28] },
    fade: { in: 1.2 },
  },
  {
    id: "S02", t0: at(3), t1: at(4), env: "cove", rig: "dawn",
    note: "Close on his boots: he reties the laces with his beak. The bow pulls tight on beat 3.",
    cam: cam([
      { t: at(3), pos: [0.42, 0.13, 0.62], look: K("footR", [0, 0.04, 0]), fov: 26 },
      { t: at(4), pos: [0.36, 0.12, 0.54], look: K("footR", [0, 0.04, 0]), fov: 26, e: "inOut" },
    ], [
      { t: at(3), pos: [0.4, 0.2, 0.7], look: K("footR", [0, 0.1, 0]), fov: 40 },
      { t: at(4), pos: [0.34, 0.19, 0.62], look: K("footR", [0, 0.1, 0]), fov: 40, e: "inOut" },
    ]),
    kiwi: { at: [0, 0], yaw: 35, beanie: true, acts: [{ do: "tie", t0: at(3), t1: at(4), pull: [at(3, 2)] }] },
    envOpts: { marker: [0.48, -0.28], closeup: true },
  },
  {
    id: "S03", t0: at(4), t1: at(5), env: "cove", rig: "dawn",
    note: "He stands (anticipation, overshoot), settles his beanie with a head wiggle, turns and walks off past the triangle. On beat 4 the sky behind starts to darken.",
    cam: cam([
      { t: at(4), pos: [-0.5, 0.42, 2.4], look: K("body", [0.1, 0.06, 0]), fov: 30 },
      { t: at(5), pos: [0.2, 0.42, 2.35], look: K("body", [0.15, 0.06, 0]), fov: 30, e: "inOut" },
    ]),
    kiwi: {
      at: [0, 0], yaw: 35, beanie: true, acts: [
        { do: "stand", t0: at(4), t1: at(4, 1) },
        { do: "settle", t0: at(4, 1), t1: at(4, 1.6) },
        { do: "walk", t0: at(4, 1.6), t1: at(5), from: [0, 0], to: [walkSpeed * BEAT * 2.4, 0] },
      ],
    },
    envOpts: { marker: [0.48, -0.28], darken: [at(4, 3), at(5)] },
    dim: { t0: at(4, 3), t1: at(5), key: 0.55, exposure: 0.85 },
  },
  // ------------------------------------------------------------------ ACT 2: the island throws everything
  {
    id: "S04", t0: at(5), t1: at(6), env: "coast_storm", rig: "storm",
    note: "Side tracking shot on the coastal track. Black sea, rolling cloud. Lightning strikes the sea behind him on beat 3: impact frames, flash, thunder. He walks on.",
    cam: cam([
      { t: at(5), pos: [-0.35, 0.55, 3.4], look: K("body", [0, 0.25, -1]), fov: 32 },
      { t: at(6), pos: [0.35, 0.5, 3.4], look: K("body", [0, 0.25, -1]), fov: 32, e: "linear" },
    ]),
    kiwi: { at: [-0.6, 0], beanie: true, wind: [1, 0, 0.3], acts: [{ do: "walk", t0: at(5), t1: at(6), from: [-0.6, 0], to: [0.6, 0] }] },
    fx: [{ type: "lightning", t: at(5, 2), at: [1.5, 0, -60], seed: 4 }, { type: "rain", density: 0.35, angle: -12 }],
    impacts: [{ t: at(5, 2), seq: "NNII", c: [0.6, 0.65], lines: 0.8, aberr: 2 }],
    flash: [{ t: at(5, 2), dur: 0.18, k: 1 }, { t: at(5, 2.35), dur: 0.08, k: 0.6 }],
    shake: [{ t: at(5, 2), amp: 0.6, dur: 0.7 }],
  },
  {
    id: "S05", t0: at(6), t1: at(7), env: "river", rig: "flood",
    note: "A swing bridge over a river in flood. The flood surges; on beat 3 a wave rears up and smashes spray across the bridge. He keeps walking, dry.",
    cam: cam([
      { t: at(6), pos: [0.15, -0.25, 2.7], look: K("body", [0, 0.1, 0]), fov: 34 },
      { t: at(7), pos: [0.45, -0.2, 2.55], look: K("body", [0, 0.1, 0]), fov: 34, e: "linear" },
    ]),
    kiwi: { at: [-0.6, 0], beanie: true, acts: [{ do: "walk", t0: at(6), t1: at(7), from: [-0.6, 0], to: [0.6, 0] }] },
    fx: [{ type: "flood", t: at(6, 2), seed: 2 }, { type: "rain", density: 0.5, angle: -8 }],
    shake: [{ t: at(6, 2), amp: 0.5, dur: 0.8 }],
  },
  {
    id: "S06", t0: at(7), t1: at(8), env: "bush", rig: "bush",
    note: "Beech forest track, ferns, moss. A sandfly swarm pours in, spirals round him into a dense vortex on beat 3, then breaks apart as he simply walks through.",
    cam: cam([
      { t: at(7), pos: [-0.05, 0.42, 2.0], look: K("head", [0, -0.05, 0]), fov: 32 },
      { t: at(8), pos: [0.3, 0.4, 1.8], look: K("head", [0, -0.05, 0]), fov: 32, e: "linear" },
    ]),
    kiwi: { at: [-0.6, 0], beanie: true, acts: [{ do: "walk", t0: at(7), t1: at(8), from: [-0.6, 0], to: [0.6, 0] }, { do: "blink", t: at(7, 3) }] },
    fx: [{ type: "sandflies", t0: at(7, 0.3), vortex: at(7, 2), t1: at(8), seed: 6 }],
  },
  {
    id: "S07", t0: at(8), t1: at(9), env: "scree", rig: "scree",
    note: "A steep scree slope in driving rain. He climbs steadily. Rocks bound past him on beats 2 and 4.",
    cam: cam([
      { t: at(8), pos: [-0.3, 0.55, 4.2], look: K("body", [0, 0.1, 0]), fov: 30 },
      { t: at(9), pos: [0.2, 0.75, 4.1], look: K("body", [0, 0.1, 0]), fov: 30, e: "linear" },
    ]),
    kiwi: { at: [-0.55, 0], beanie: true, acts: [{ do: "walk", t0: at(8), t1: at(9), from: [-0.55, 0], to: [0.42, 0] }] },
    fx: [{ type: "rain", density: 1, angle: -18 }, { type: "rocks", times: [at(8, 1), at(8, 3)], seed: 9 }],
    shake: [{ t: at(8, 1), amp: 0.25, dur: 0.4 }, { t: at(8, 3), amp: 0.3, dur: 0.4 }],
    envOpts: { slope: 0.45 },
  },
  {
    id: "S08", t0: at(9), t1: at(10), env: "snow_pass", rig: "snow",
    note: "A snowy traverse under a mountain face. The avalanche breaks on beat 1, the white cloud engulfs the frame on beat 3 (impact), and thins to show him still walking, a little snow on his beanie.",
    cam: cam([
      { t: at(9), pos: [-0.1, 0.5, 3.6], look: K("body", [0, 0.35, -1]), fov: 32 },
      { t: at(10), pos: [0.3, 0.48, 3.4], look: K("body", [0, 0.3, -1]), fov: 32, e: "linear" },
    ]),
    kiwi: { at: [-0.6, 0], beanie: true, acts: [{ do: "walk", t0: at(9), t1: at(10), from: [-0.6, 0], to: [0.6, 0] }, { do: "snowHat", t: at(9, 2.5) }] },
    fx: [{ type: "avalanche", t0: at(9), hit: at(9, 2), clear: at(9, 3.4), seed: 3 }, { type: "snow", density: 0.4 }],
    impacts: [{ t: at(9, 2), seq: "NNI", c: [0.5, 0.45], lines: 0.6, aberr: 1.5 }],
    shake: [{ t: at(9, 2), amp: 0.7, dur: 0.9 }],
  },
  {
    id: "S09", t0: at(10), t1: at(11), env: "red_crater", rig: "gale",
    note: "Low hero angle on a red volcanic ridge, emerald lakes below. A gale: streaks, pompom whipping, pack straps flapping. A huge gust on beat 3; he leans into it and does not budge.",
    cam: cam([
      { t: at(10), pos: [0.45, 0.1, 1.45], look: K("body", [0.05, 0.22, 0]), fov: 34 },
      { t: at(11), pos: [0.65, 0.12, 1.3], look: K("body", [0.05, 0.22, 0]), fov: 34, e: "linear" },
    ]),
    kiwi: { at: [-0.5, 0], beanie: true, wind: [-1, 0.1, 0.2], acts: [{ do: "walk", t0: at(10), t1: at(11), from: [-0.5, 0], to: [0.55, 0], lean: 12 }] },
    fx: [{ type: "wind", gust: at(10, 2), strength: 1, dir: [-1, 0, 0.15] }],
    shake: [{ t: at(10, 2), amp: 0.45, dur: 0.8, decay: 4 }],
  },
  // montage: one beat each, every hit at once, dutch angles, impact frames + speed lines
  {
    id: "S10a", t0: at(11), t1: at(11, 1), env: "coast_storm", rig: "storm",
    cam: cam([{ t: at(11), pos: [0.1, 0.35, 1.5], look: K("head", [0, 0, 0]), fov: 30, roll: -9 }, { t: at(11, 1), pos: [0.05, 0.35, 1.35], look: K("head", [0, 0, 0]), fov: 30, roll: -10, e: "linear" }]),
    kiwi: { at: [0, 0], beanie: true, wind: [1, 0, 0.3], acts: [{ do: "walk", t0: at(11) - 0.5, t1: at(11, 1), from: [-0.22, 0], to: [0.08, 0] }] },
    fx: [{ type: "lightning", t: at(11), at: [-0.8, 0, -25], seed: 11 }, { type: "rain", density: 0.6, angle: -15 }],
    impacts: [{ t: at(11), seq: "NIIN", c: [0.35, 0.7], lines: 1, aberr: 2.5 }], flash: [{ t: at(11), dur: 0.15 }], shake: [{ t: at(11), amp: 0.9, dur: 0.6 }],
  },
  {
    id: "S10b", t0: at(11, 1), t1: at(11, 2), env: "river", rig: "flood",
    cam: cam([{ t: at(11, 1), pos: [0.25, 0.05, 1.4], look: K("head", [0, -0.05, 0]), fov: 30, roll: 9 }, { t: at(11, 2), pos: [0.2, 0.05, 1.3], look: K("head", [0, -0.05, 0]), fov: 30, roll: 10, e: "linear" }]),
    kiwi: { at: [0, 0], beanie: true, acts: [{ do: "walk", t0: at(11, 1) - 0.5, t1: at(11, 2), from: [-0.22, 0], to: [0.08, 0] }] },
    fx: [{ type: "flood", t: at(11, 1) - 0.25, seed: 12 }],
    impacts: [{ t: at(11, 1), seq: "IIN", c: [0.5, 0.4], lines: 1, aberr: 2 }], shake: [{ t: at(11, 1), amp: 0.9, dur: 0.6 }],
  },
  {
    id: "S10c", t0: at(11, 2), t1: at(11, 3), env: "snow_pass", rig: "snow",
    cam: cam([{ t: at(11, 2), pos: [-0.15, 0.3, 1.5], look: K("head", [0, 0, 0]), fov: 30, roll: -7 }, { t: at(11, 3), pos: [-0.12, 0.3, 1.4], look: K("head", [0, 0, 0]), fov: 30, roll: -8, e: "linear" }]),
    kiwi: { at: [0, 0], beanie: true, acts: [{ do: "walk", t0: at(11, 2) - 0.5, t1: at(11, 3), from: [-0.22, 0], to: [0.08, 0] }] },
    fx: [{ type: "avalanche", t0: at(11, 2) - 1.2, hit: at(11, 2), clear: at(11, 3) + 0.4, seed: 13 }, { type: "snow", density: 0.7 }],
    impacts: [{ t: at(11, 2), seq: "NIN", c: [0.5, 0.5], lines: 1, aberr: 2 }], shake: [{ t: at(11, 2), amp: 0.9, dur: 0.6 }],
  },
  {
    id: "S10d", t0: at(11, 3), t1: at(12), env: "red_crater", rig: "gale",
    cam: cam([{ t: at(11, 3), pos: [0.3, 0.12, 1.2], look: K("head", [0, -0.05, 0]), fov: 30, roll: 11 }, { t: at(12), pos: [0.28, 0.12, 1.1], look: K("head", [0, -0.05, 0]), fov: 30, roll: 12, e: "linear" }]),
    kiwi: { at: [0, 0], beanie: true, wind: [-1, 0.15, 0.2], acts: [{ do: "walk", t0: at(11, 3) - 0.5, t1: at(12), from: [-0.22, 0], to: [0.08, 0], lean: 14 }] },
    fx: [{ type: "wind", gust: at(11, 3), strength: 1.4, dir: [-1, 0, 0.15] }],
    impacts: [{ t: at(11, 3), seq: "IINN", c: [0.45, 0.45], lines: 1, aberr: 2.5 }], shake: [{ t: at(11, 3), amp: 1.0, dur: 0.6 }],
  },
  {
    id: "S11", t0: at(12), t1: at(13), env: "coast_storm", rig: "storm",
    note: "Extreme close-up of his eye: calm, half-lidded. The chaos flickers in its reflection. One slow blink.",
    cam: cam([
      { t: at(12), pos: K("eyeR", [0.03, 0.012, 0.13]), look: K("eyeR", [0.01, 0, 0]), fov: 24 },
      { t: at(13), pos: K("eyeR", [0.02, 0.01, 0.1]), look: K("eyeR", [0.008, 0, 0]), fov: 24, e: "inOut" },
    ], [
      { t: at(12), pos: K("eyeR", [0.03, 0.01, 0.17]), look: K("eyeR", [0.0, -0.02, 0]), fov: 36 },
      { t: at(13), pos: K("eyeR", [0.02, 0.01, 0.13]), look: K("eyeR", [0.0, -0.02, 0]), fov: 36, e: "inOut" },
    ]),
    kiwi: { at: [0, 0], yaw: 90, beanie: true, wind: [1, 0, 0.3], acts: [{ do: "idle", t0: at(12), t1: at(13), calm: true }, { do: "blink", t: at(12, 2.5), slow: true }] },
    envOpts: { closeup: true },
    fx: [{ type: "rain", density: 0.3, angle: -12 }],
    flash: [{ t: at(12, 1), dur: 0.12, k: 0.8 }, { t: at(12, 2.25), dur: 0.1, k: 0.6 }, { t: at(12, 3.5), dur: 0.14, k: 0.9 }],
  },
  {
    id: "S12", t0: at(13), t1: at(14), env: "spiral_sky", rig: "spiral",
    note: "Pull back and tilt up: the storm drains into an indigo spiral around the sun. The kiwi is a speck on the ridge.",
    cam: cam([
      { t: at(13), pos: [0.75, 0.32, 1.7], look: [0, 0.32, 0], fov: 30 },
      { t: at(14), pos: [3.4, 1.2, 10.5], look: [0, 9, -40], fov: 40, e: "inOut" },
    ], [
      { t: at(13), pos: [0.75, 0.4, 2.1], look: [0, 0.45, 0], fov: 46 },
      { t: at(14), pos: [3.4, 1.2, 11], look: [0, 12, -40], fov: 60, e: "inOut" },
    ]),
    kiwi: { at: [0, 0], yaw: 90, beanie: true, wind: [0.5, 0.2, 0], acts: [{ do: "idle", t0: at(13), t1: at(14) }] },
    envOpts: { spiral: { t0: at(13), t1: at(14) } },
    fx: [{ type: "wind", spiral: true, strength: 0.8 }],
  },
  // ------------------------------------------------------------------ ACT 3: silence
  {
    id: "S13", t0: at(14), t1: at(14, 3), env: "ridge_calm", rig: "silence",
    note: "Total silence. The wind lifts his beanie off and away. For the first time he looks up: head tilts, eye opens wide, a glint.",
    cam: cam([
      { t: at(14), pos: [0.62, 0.42, 1.25], look: K("head", [0.02, 0.0, 0]), fov: 28 },
      { t: at(14, 3), pos: [0.55, 0.36, 1.1], look: K("head", [0.02, 0.04, 0]), fov: 28, e: "inOut" },
    ], [
      { t: at(14), pos: [0.75, 0.38, 1.65], look: K("head", [-0.06, 0.08, 0]), fov: 42 },
      { t: at(14, 3), pos: [0.68, 0.34, 1.5], look: K("head", [-0.06, 0.12, 0]), fov: 42, e: "inOut" },
    ]),
    kiwi: { at: [0, 0], yaw: 70, beanie: true, acts: [{ do: "idle", t0: at(14), t1: at(14, 3) }, { do: "beanieOff", t0: at(14, 0.35), t1: at(14, 2.2) }, { do: "lookUp", t0: at(14, 1.1), t1: at(14, 2.3), deg: 35 }] },
    fx: [{ type: "motes", density: 0.6 }],
  },
  {
    id: "S14", t0: at(14, 3), t1: at(15, 2), env: "ridge_calm", rig: "silence",
    note: "Low close on his foot. It lifts, slowly, and plants on the downbeat of bar 15: impact, shockwave through the tussock, the first major chord.",
    cam: cam([
      { t: at(14, 3), pos: [0.42, 0.07, 0.6], look: K("footL", [0.0, 0.06, 0]), fov: 30 },
      { t: at(15), pos: [0.4, 0.06, 0.56], look: K("footL", [0.0, 0.05, 0]), fov: 30, e: "inOut", jerkOK: true },
      { t: at(15, 2), pos: [0.5, 0.1, 0.75], look: K("footL", [0.0, 0.08, 0]), fov: 32, e: "outExpo", jerkOK: true },
    ]),
    kiwi: { at: [0, 0], yaw: 70, beanie: false, acts: [{ do: "lookUp", t0: at(14, 3) - 1, t1: at(14, 3), deg: 35, hold: true }, { do: "step", t0: at(14, 3), plant: at(15), foot: "L", len: 0.16 }] },
    fx: [{ type: "shockwave", t: at(15), anchor: "footL" }, { type: "motes", density: 0.4 }],
    impacts: [{ t: at(15), seq: "IINN", c: [0.5, 0.35], lines: 1, aberr: 3 }],
    shake: [{ t: at(15), amp: 0.8, dur: 0.6 }],
  },
  {
    id: "S15", t0: at(15, 2), t1: at(17, 2), env: "island", rig: "island",
    note: "The whole South Island from the sky, at night. The clouds part in a ring. One by one the orange triangles light from Ship Cove to Bluff along the real trail.",
    cam: cam([
      { t: at(15, 2), pos: [255, 150, -275], look: [255, 0, -325], fov: 36 },
      { t: at(17, 2), pos: [40, 1050, 520], look: [-15, 0, 10], fov: 36, e: "inOut" },
    ], [
      { t: at(15, 2), pos: [255, 230, -250], look: [255, 0, -320], fov: 56 },
      { t: at(17, 2), pos: [20, 1500, 560], look: [-15, 0, 15], fov: 56, e: "inOut" },
    ]),
    kiwi: null,
    envOpts: { part: [at(15, 2.5), at(16, 3)] },
    fx: [{ type: "trail_lights", t0: 39.0, t1: at(17, 1.5), count: 48 }],   // the score plays one glock note per light on this formula
  },
  {
    id: "S16", t0: at(17, 2), t1: at(18, 3), env: "bluff", rig: "bluff",
    note: "Bluff at sunrise. The last triangle lights. His beanie floats down and lands on his head on the downbeat; he settles it and walks on into the morning.",
    cam: cam([
      { t: at(17, 2), pos: [-0.75, 0.48, 2.5], look: [0.2, 0.42, -0.6], fov: 30 },
      { t: at(18, 3), pos: [-0.35, 0.44, 2.25], look: [0.5, 0.4, -0.6], fov: 30, e: "inOut" },
    ]),
    kiwi: {
      at: [0, 0], yaw: 55, beanie: false, acts: [
        { do: "lookUp", t0: at(17, 2), t1: at(17, 3), deg: 35, hold: true, from: 35 },
        { do: "beanieLand", t0: at(17, 2.6), t1: at(18) },
        { do: "lookUp", t0: at(18), t1: at(18, 0.5), deg: 0, from: 35 },
        { do: "settle", t0: at(18, 0.4), t1: at(18, 1) },
        { do: "walk", t0: at(18, 1), t1: at(18, 3), from: [0, 0], to: [0.6, -0.15] },
      ],
    },
    envOpts: { marker: [0.55, -0.35], markerLit: at(17, 2) + 1 / 24 },   // lights on the 2nd frame, with the glock ding at 44.0
    fx: [{ type: "motes", density: 0.5 }],
  },
  {
    id: "S17", t0: at(18, 3), t1: 51.0, env: "endcard", rig: "night",
    note: "End title on the night of the map: TA. + the line (FR or EN). The dot lands on the last chord.",
    cam: cam([{ t: at(18, 3), pos: [0, 0, 10], look: [0, 0, 0], fov: 30 }, { t: 51.0, pos: [0, 0.15, 9.4], look: [0, 0.05, 0], fov: 30, e: "linear" }]),
    kiwi: null,
    title: { t0: at(18, 3) },
    fade: { out: 0.6 },
  },
];

export const TITLE = { line: { fr: "Suivez-moi jour par jour", en: "Follow me day by day" } };
export const DURATION = SHOTS[SHOTS.length - 1].t1;
export { at, BEAT, BAR };
