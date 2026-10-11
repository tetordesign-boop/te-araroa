# Design notes

The site follows an Apple-Maps-like structure (map full screen, a glass sheet with three heights on phones, a floating panel on computers) with a point of view of its own.

## Principles

- **Two voices.** Everything Ewan writes (day titles, stories, captions, the hut book, his introduction) is set in Literata. Everything the site measures or controls is set in SF (system UI), with SF Rounded for numbers. Place names come from the map, so they are in SF too.
- **One colour.** The orange of New Zealand track markers (`--marker`, #FF6B12) marks where Ewan has been and where he is: the walked trail, his position, the current day, primary actions. Small orange text uses `--marker-text` for contrast. The only other colours are the map's own vocabulary: one badge colour per kind of place (below).
- **The trail line is the motif.** The same orange line runs on the map, in the progress strip (a metro-style diagram with the river crossings as breaks), down the journal as its spine, and through the elevation profiles (one per day, one for the whole trail in the flyover).
- **Few boxes.** Hierarchy comes from type and space. Platters (`--platter`) only for groups you tap: lists of days and places, the pagers, the shelves of next places, action buttons.
- **Motion answers people.** Views settle in when opened; the sheet follows the finger; reactions pop. Camera shows (orbit, Ewan's view, flyover) start only when asked, and touching the map always wins over the camera: a show stops, a flyover hands over until the profile is touched again.

## The map

Two base maps, light and dark (`src/map/style.ts`):

- **Plan**: soft land cover (forest, grass, ice, scree), colour relief by altitude (green lowlands to white summits), shaded relief, contour lines every 50 / 250 m close up (computed in a worker from the elevation tiles, `maplibre-contour`), national parks dashed, names on top, 3D terrain ×1.3.
- **Satellite**: imagery (Esri, or LINZ aerial when a key is set), the same relief, white names.

"Lumière du moment" lights the relief from where the sun is right now over Ewan (`src/map/sun.ts`), with the sky of the hour in 3D.

Places (OpenStreetMap, built by `scripts/data/pois.mjs`):

| Kind | Badge | Light | Dark | From zoom |
| --- | --- | --- | --- | --- |
| Hut, bivvy | house | #5856D6 | #7471F0 | 9.2 |
| Campsite | tent | #2E9D57 | #34A85F | 10.5 |
| Pass | saddle | #C2367A | #D9488F | 9.8 |
| Peak | small triangle + height | #3A3A3C | #E5E5EA | 8.4 (≥ 2 400 m) to 12 |
| Waterfall, viewpoint | drop, eye | #0A84C8 | #2F98DC | 11.5 / 12 |
| Transfer (river, lake) | shuttle | #8E8E93 | #98989D | 6.5 |
| Trail town | station dot / houses | #A2845E | #B59469 | tiers |

The colours were checked for colour-vision deficiency; the glyph always says the kind too. Peaks' sort key makes huts and passes win label collisions.

## Tokens (see `src/styles/app.css`)

| Role | Light | Dark |
| --- | --- | --- |
| Accent | `--marker` #FF6B12 | same |
| Accent text | `--marker-text` #C94A00 | #FF8A3D |
| Ink | #000, `--ink-2` 64 %, `--ink-3` 34 % | white equivalents |
| Sheet | `--sheet` rgba(247,247,249,.88), blur 34 px, saturate 1.35 | rgba(22,22,24,.84) |
| Controls | `.glass`, blur 26 px, saturate 1.9 | same |

Type scale: 12.5 / 14 / 15 / 17 / 18.5 (stories, line-height 1.66) / 20 (sections) / 24 (cover title) / 28 (place title) / 30 (day title) / 34 (page titles) / 52 (live km).

## Content rules

- French typography is applied to typed text by `typo()` in `src/lib/format.ts` (narrow no-break spaces before `? ! : ;`, inside « », between a number and its unit, before →).
- No ALL-CAPS labels, no middle-dot meta strings: details are joined with commas, and a km figure comes last ("Refuge, 1 310 m, km 280") so decimal commas never sit next to a separator.
- Photos: the cover first, then rows of three and two, never a lone tile (`rowSizes()` in `Gallery.tsx`).
- Elevations read from the trail profile rather than the map data are marked "≈".

## Checking a change

`npm run dev`, then open `/?mock` (16 sample days), `/?mock&before` (before departure), `/?mock&slow` (loading state). Without access to the tile servers, add `&offline-map` (a plain land shape). Check a phone width (393 px) and a computer width (1440 px), light and dark, FR and EN.

Screenshots on the real map: push to `bot/qa`; the "Captures de contrôle" workflow publishes them on `bot/qa-out` (`scripts/qa/shots.mjs` lists the views). The places and the elevation profile are rebuilt by pushing to `bot/data` (results on `bot/data-out`, to copy into `public/data/`).
