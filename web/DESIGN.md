# Design notes

The site follows an Apple-Maps-like structure (map full screen, a glass sheet with three heights on phones, a floating panel on computers), drawn at night: "Mackenzie night", after the dark-sky reserve over Tekapo.

## Principles

- **Night map, lit trail.** The map is navy; the relief is lit like by the moon; the glacier lakes glow turquoise. The only warm light is Ewan's: the walked trail is a lit tube of track-marker orange, his marker glows, the open day's stretch lights up.
- **Orange means Ewan, turquoise means the map.** `--marker` #FF6B12 (the orange triangles nailed to every post of the trail): where he walked and is, his days, the actions about him. `--glacier` #5CD6E6 (Tekapo): the map's own controls, search, the open place, focus rings. Nothing else gets colour, except the kinds of places (below).
- **Two voices.** Everything Ewan writes (day titles, stories, captions, the hut book, his introduction) is set in Literata. Everything the site says and measures is set in Archivo Variable; numbers and headlines are stretched wide (`font-stretch` 110 to 125 %, weights 750 to 860) like a race bib. The kilometres he walked are the hero.
- **The trail line is the motif.** The same orange line runs on the map, in the progress strip (a metro-style diagram with the river crossings as breaks), down the journal as its spine, and through the elevation profiles.
- **Every touch answers.** Pressed things give a little and spring back (`--spring`, a `linear()` spring); the sheet follows the finger and springs to its height with the speed of the flick; a place touched on the map pops and sends a ring of its own colour; reactions burst; a signed note glows at the top of the hut book; profiles and bars draw themselves when they appear.
- **One orchestrated moment.** On arrival, over the whole island, the trail he walked draws itself from Ship Cove while his kilometres count up on the same clock; he lands with a ping and the camera dives to him. Nothing else moves on its own; camera shows (orbit, Ewan's view, flyover) start only when asked, and touching the map always wins.
- **The presentation, once.** On a first visit to the plain address (never on a link to a day, a place or the flyover), the island at night sways slowly under the title while a light runs the whole trail from Ship Cove to Bluff, again and again. The words say where Ewan is today, so nobody has to go in to know. A tap anywhere, Enter or Escape goes in: the words lift away, the sheet rises, and the arrival plays. It can be watched again from "À propos". Reduced motion: the same screen, still.

## Sounds

`src/lib/sound.ts`: synthesised with Web Audio (no files), one small family of soft tones. A tap is a wooden "tock"; links open with two rising notes and close buttons with two falling ones; switches and filters say on or off; a place touched on the map is a bubble (huts low, summits high); the sheet settling after a drag is a low thud; a reaction sparkles; a signed note is a warm chord; the camera shows (flyover, Ewan's view, the turn around a place) breathe; going in from the presentation chimes; Ewan landing at the end of the arrival pings, far away. Buttons can name their sound with `data-sfx` (or `none` when their code plays one). Quiet, one at a time, ambient audio session on iPhone (the silent switch mutes them and they never stop the visitor's music), and a switch in "À propos" turns them off.

## Handling

- The sheet is positioned by script (`ui/Sheet.tsx`): no React render while dragging, a spring integrated in small steps on real time, velocity from the events' own timestamps (a busy phone delivers moves late), rubber band past its ends, a clear flick always moves one height. Fully open, the content scrolls and pulls the sheet down once it is back at the top.
- The map never moves when the sheet does: the new padding is applied in place, and only the next flight frames things in the free part.
- Taps on the map look 22 px around the finger and take the place drawn closest; a tap on nothing closes the place card (and only the map modes card, if that is what was open). On touch screens the map ignores the first 7 px a finger wobbles (`clickTolerance`), so a tap neither nudges the map nor gets lost.
- A press in the sheet may wander 10 px (a finger) or 5 px (a mouse) and still be a tap: buttons are never swallowed by a would-be drag. A gesture the browser takes over (a sideways swipe on a shelf) is not a tap either.
- The page itself never zooms on a phone (no double-tap zoom, Safari's pinch is cancelled): the map and the photos zoom. Holding a control doesn't select its words or open a link preview.

## The map

`src/map/style.ts`, night palette (`DARK`):

| Layer | Colour |
| --- | --- |
| Land, relief by altitude | #0F1A2C, up to #6F8AAD at 3 400 m |
| Shaded relief | shadow #01040B, highlight #7E9FCC (warm at golden hour with "Lumière du moment") |
| Forest, ice | #0E2B2E, #BCD3F0 at 50 % |
| Sea | #060D19 |
| Lakes, rivers | #0D7487 with a #5CD6E6 shoreline, #2AA9BE |
| Trail to walk / walked | #C3D2EA at 62 % / #FF6B12 with glow and a #FFD9BD core |

Places (OpenStreetMap, built by `scripts/data/pois.mjs`): bright disks with a navy glyph and a soft glow of their own colour.

| Kind | Glyph | Colour | From zoom |
| --- | --- | --- | --- |
| Hut, bivvy | house | #8B80FF | 9.2 |
| Campsite | tent | #56E39F | 10.5 |
| Pass | saddle | #FF3D9A | 9.8 |
| Peak | small triangle + height | #EAF2FF | 8.4 (≥ 2 400 m) to 12 |
| Waterfall, viewpoint | drop, eye | #4CC3FF | 11.5 / 12 |
| Transfer (river, lake) | shuttle | #9AA8BE | 6.5 |
| Trail town | station ring | #E0B370 in lists | tiers |

The colours were checked against each other for protanopia, deuteranopia and tritanopia (worst pair ΔE ≈ 14, camp vs town, which never meet on the map); the glyph always says the kind too.

## Tokens (see `src/styles/app.css`)

| Role | Value |
| --- | --- |
| Night (base) | `--night` #0C1526, `--night-deep` #070E1B |
| Sheet | `--surface` rgba(13, 21, 38, .8), blur 32 px, saturate 1.45 |
| Controls | `.glass`, rgba(15, 24, 43, .72), blur 24 px |
| Platters | `--raise` (lists, shelves, actions), `--fill` (buttons, fields) |
| Ink | #F3F6FB, `--ink-2` #A9B6CC (7.9:1), `--ink-3` #6F7F99 (4.5:1) |
| Ewan | `--marker` #FF6B12, text `--marker-hot` #FF8B3D (7.8:1), dark text on orange `--on-marker` |
| Map | `--glacier` #5CD6E6, dark text on it `--on-glacier` |

Type scale: 12.5 / 14 / 15 / 16 (body, weight 450) / 18.5 (stories, Literata, line-height 1.68) / 20 (sections) / 24 (cover title) / 28 (place title) / 30 (day title) / 32 (page titles) / 64 (stats) / 70 (live km).

## Content rules

- French typography is applied to typed text by `typo()` in `src/lib/format.ts` (narrow no-break spaces before `? ! : ;`, inside « », between a number and its unit, before →).
- No ALL-CAPS labels, no middle-dot meta strings: details are joined with commas, and a km figure comes last ("Refuge, 1 310 m, km 280") so decimal commas never sit next to a separator. Ranges use an en dash ("Havelock – St Arnaud").
- Photos: the cover first, then rows of three and two, never a lone tile (`rowSizes()` in `Gallery.tsx`).
- Elevations read from the trail profile rather than the map data are marked "≈".

## Checking a change

`npm run dev`, then open `/?mock` (16 sample days), `/?mock&before` (before departure), `/?mock&slow` (loading state). Without access to the tile servers, add `&offline-map` (a plain land shape). Check a phone width (393 px) and a computer width (1440 px), FR and EN, and with reduced motion.

Screenshots on the real map: push to `bot/qa`; the "Captures de contrôle" workflow publishes them on `bot/qa-out` (`scripts/qa/shots.mjs` lists the views). The places and the elevation profile are rebuilt by pushing to `bot/data` (results on `bot/data-out`, to copy into `public/data/`). The icons and the link preview are drawn by `scripts/brand/icons.mjs` and `scripts/brand/og.mjs`.
