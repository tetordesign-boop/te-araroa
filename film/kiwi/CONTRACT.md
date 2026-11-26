# « Le kiwi » — production contract

A ~51 s 2D-anime short for the Te Araroa site (Ewan's thru-hike of New Zealand's South Island, 1 334 km from Ship
Cove to Bluff). It sits on the site as a **second film** next to the existing infographic film. 1920×1080 and
1080×1920, 24 fps, H.264; orchestral CC0 score. Only on-screen text: the end title (core handles it).

Read `src/shots.js` first: it is the director's shot list (times, cameras, kiwi actions, FX, impacts). **Every hit
lands on the music** (90 BPM, a beat = 0.667 s, a bar = 2.667 s, `at(bar, beat)`). Never hard-code a time: read it
from the shot / spec you are given.

## Art direction ("un style bien à lui")

- **Painted anime backgrounds** (gouache feel): big skies, stacked cumulus with lit tops and flat bases, strong
  silhouettes, 3–5 depth layers, atmospheric perspective (far layers fade toward `rig.fog.color` and lose contrast).
  Painted with *strokes*, never flat vector fills; the brush pass (Kuwahara + paper grain) then flattens strokes into
  painterly patches. No ink lines on backgrounds.
- **Cel-shaded 3D** for the kiwi and anything he touches or that sits close to camera: 2 tones + rim light from the
  shot's rig, ink lines from the ink pass (Sobel on depth/normals) + inverted-hull outline on the kiwi.
- **Colour law:** marker orange `#FF6B12` belongs to **the trail only** (triangle markers, the kiwi's pompom, the
  climax lights). Use it nowhere else. Glacier cyan `#5CD6E6` is the secondary accent (emerald lakes, rim light).
  Night `#0C1526` is home. Each scene lives inside its rig palette (`src/core/rigs.js`): read colours from `ctx.rig`
  (sky, fog, key, shade, rim) so every department sits in the same light.
- **Motion:** characters and FX are animated **on twos** (use `t2`, which steps every 2 frames); camera moves are on
  ones. Weighted motion: anticipation, overshoot, follow-through, settle. Impacts are sudden (no easing in), settle
  with damped springs.
- New Zealand specifics welcome and accurate: beech forest with crown ferns and moss, swing bridges, scree, tussock,
  the orange-tipped marker poles with an orange triangle, Red Crater's ochre-red rock with emerald lakes, Bluff's
  signpost at Stirling Point (generic signpost, no readable text, no brands).

## Files and owners (touch only your own files)

| Department | Owns |
|---|---|
| Core / director | `src/core/*`, `src/shots.js`, `render/*`, `CONTRACT.md`, `src/world/_placeholder.js` |
| World A — land | `src/world/{cove,coast_storm,river,bush,bluff}.js`, `src/world/land/*` (helpers) |
| World B — mountains & sky | `src/world/{scree,snow_pass,red_crater,spiral_sky,ridge_calm,island,endcard}.js`, `src/world/sky/*` |
| Kiwi | `src/kiwi/*` |
| FX | `src/fx/*` |
| Sound | `sound/*` |

If you need something from another department or the core, write it in your final report; do not edit their files.

## Coordinates and units

Metres, Y up (S15 island: kilometres, see `src/core/geo.js`). In side shots the kiwi walks **+X**; cameras sit on the
**+Z** side looking toward −Z, so "behind him" is −Z. Kiwi yaw: degrees about Y, 0 = facing +Z (camera), 90 = facing
+X. The kiwi's path, the cameras and all event times are in `src/shots.js`. Kiwi size: ~0.42 m to the top of the back,
~0.58 m with beanie, eye height ~0.36 m, a step ≈ 0.15 m, 3 steps a second (a step every half beat).

## Determinism

Everything is a **pure function of time**. Frames are rendered in any order and some more than once (camera targeting
re-poses the kiwi). No `Math.random`, no state carried between `update` calls, no wall-clock time. Use
`ctx.T.rng(seed)`, `ctx.T.hash`, `ctx.T.noise1/noise2/fbm*`, `ctx.T.springFollow` (simulates a spring from a start time).

## Interfaces

`ctx` (given to every module): `THREE, T` (time.js: `at, BEAT, BAR, FPS, twos, ease, keys, clamp, lerp, smooth, rng,
hash, noise*, fbm*, springFollow`), `paint` (core/paint.js brush helpers), `PALETTE, RIGS, rig, shot, opts`
(= `shot.envOpts`), `scene, camera` (live camera, already placed for the frame when `update` runs), `renderer`,
`celMaterial(opts), outlineMaterial(width, color), inkable(obj), INK, heightAt(x, z)`, `kiwi` (once created),
`layers` (baked env layers: `{name, L, mesh}`; `mesh.material.uniforms.uOpacity/uTint/uScroll`),
`paintTexture(w, h, (g, w, h) => {...}, {r, paper})` → a brushed `THREE.Texture` for 3D props/terrain.

### World env — `src/world/<env>.js`
```js
export default {
  layers: [   // painted multiplane backgrounds, any order; core sorts by depth
    { name: "sky", depth: 900, paint(g, L, ctx) {}, brush: { r: 3, paper: 0.06 }, blur: 0, quality: 1, flash: 0.5 },
  ],
  build(ctx) { return { group, heightAt(x, z), colliders: [meshes], update(t, t2, ctx) {}, dispose() {} }; },
};
```
- Each layer is a vertical plane `depth` metres in front of the shot's cameras, sized automatically to cover every
  frame of the shot in **both** aspects. `L` maps world to canvas: `L.w, L.h` (px), `L.px(s, y)` (s = metres along the
  plane's right vector ≈ world X for cameras looking −Z; y = world height), `L.sx(s)`, `L.yy(y)`, `L.ppm` (px per m),
  `L.ang(azimuthDeg, elevationDeg)` (a direction seen from the mean camera → px), `L.horizon` (canvas y of eye level).
  Paint in world terms so layers line up across shots and aspects. `brush.r` = Kuwahara radius (0–6), `paper` grain.
  `blur` (px) for out-of-focus close-ups (`ctx.opts.closeup`). Bake cost ≈ 6 s per 2500² layer at r=3, so ≤ 5 layers.
- `build` makes the 3D part: walkable ground (cel material, painted texture welcome), props near camera (marker
  posts, rocks, tussock, ferns, bridge), foreground elements for parallax. Mark solid things `inkable()` if they
  should get ink lines (props yes; big ground usually no). `heightAt(x, z)` must return the walkable surface height
  (including bridge decks, stones…) — the kiwi plants his feet with it. `colliders` = every mesh the feet or the camera
  must not go into (ground + solid props); set `mesh.userData.closed = true` on closed volumes (rocks, posts).
- `update(t, t2, ctx)` for anything time-based in the env (sky darkening via layer `uOpacity`, water scroll, marker
  glow). Things that appear or vanish mid-shot must fade/grow, or set `userData.popOK = true` if a hard cut is
  intended (impact-style).

### Kiwi — `src/kiwi/kiwi.js`
```js
export default { async create(ctx) { return { root, update(t, t2, spec, ctx), anchor(name), contacts(), dispose() }; } };
```
- `spec` = `shot.kiwi`: `{ at: [x, z], yaw, beanie: bool (on head at shot start), wind: [x,y,z], acts: [...] }`.
  Actions (`do`): `sit`, `tie {pull:[t]}` (beak pulls the bootlace tight at each t), `stand`, `settle` (head wiggle so
  the beanie sits right, pompom bounces), `walk {from:[x,z], to:[x,z], lean}`, `idle {calm}`, `blink {t, slow}`,
  `lookUp {deg, from, hold}`, `step {plant, foot, len}` (the single heroic step, foot lands exactly at `plant`),
  `beanieOff` (wind lifts it away out of frame), `beanieLand` (falls back onto the head at `t1`, squash),
  `snowHat {t}` (a small snow cap appears on the beanie).
- **Root translation and planted-foot IK on ones (`t`); everything else on twos (`t2`).** Planted feet never slide.
  Ground height from `ctx.heightAt`.
- `anchor(name)` → world `Vector3`: `root, body, head, eyeL, eyeR, beakTip, pompom, footL, footR, pack`. Cameras use
  them (`eyeR` is the eye on the +Z/camera side when he faces +X).
- `contacts()` → `[{ name: "footL"|"footR", p: Vector3 (sole, world), planted: bool }]` for the checks.

### FX — `src/fx/<type>.js`
```js
export default { create(ctx, spec) { return { object, update(t, t2, ctx), flash?(t, t2), look?(t, t2), dispose?() }; } };
```
`spec` = one entry of `shot.fx` (see shots.js for each type's fields). `flash()` may return 0..1 (lightning lights the
world); `look()` may return composite overrides (e.g. `{ exposure, lines, fade }`). Impact frames, flashes and camera
shake listed in `shots.js` are applied by the core.

### Sound — `sound/`
Python (numpy, scipy; **no** soundfile: use `scipy.io.wavfile`). Samples: VSCO-2-CE (CC0) at
`/home/claude/ext-vsco/repo` — read-only data. Output `sound/score.wav` (48 kHz stereo, exactly 51.0 s) + `sound/cues.md`.

## Tools

- Preview frames (the only way to see your work): `node render/preview.mjs --shot S04 --at 0.1,0.5,0.9 --tag mytag`
  or `--times 12.0,12.04`; `--aspect 16x9|9x16|both`. JPEGs go to `out/preview/`; open them with the Read tool.
  A shot build bakes its layers (10–30 s), later frames of the same shot take ~0.5 s.
- **The machine has 2 CPUs shared by five departments.** Preview a handful of frames at a time, never loop over a whole
  shot, never start a full render. Write your own scratch files under `out/<department>/`.
- Checks (feet, camera, pops): the director runs `node render/check.mjs`; you may run it on your shots with
  `--shots S04,S05`.
