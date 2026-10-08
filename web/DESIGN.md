# Design notes

The site follows an Apple-Maps-like structure (map full screen, a glass sheet with three heights on phones, a floating panel on computers) with a point of view of its own.

## Principles

- **Two voices.** Everything Ewan writes (day titles, stories, captions, the hut book, his introduction) is set in Literata. Everything the site measures or controls is set in SF (system UI), with SF Rounded for numbers.
- **One colour.** The orange of New Zealand track markers (`--marker`, #FF6B12) marks where Ewan has been and where he is: the walked trail, his position, the current day, primary actions. Small orange text uses `--marker-text` for contrast.
- **The trail line is the motif.** The same orange line runs on the map, in the progress strip (a metro-style diagram with the river crossings as breaks), down the journal as its spine, and through the elevation profile.
- **Few boxes.** Hierarchy comes from type and space. Platters (`--platter`) only for groups you tap: lists of days, the day pager.
- **Motion answers people.** Views settle in when opened; the sheet follows the finger; reactions pop. The only motion nobody asked for is the first flight over the island.

## Tokens (see `src/styles/app.css`)

| Role | Light | Dark |
| --- | --- | --- |
| Accent | `--marker` #FF6B12 | same |
| Accent text | `--marker-text` #C94A00 | #FF8A3D |
| Ink | #000, `--ink-2` 64 %, `--ink-3` 34 % | white equivalents |
| Sheet | `--sheet` rgba(247,247,249,.88), blur 34 px, saturate 1.35 | rgba(22,22,24,.84) |
| Controls | `.glass`, blur 26 px, saturate 1.9 | same |

Type scale: 12.5 / 14 / 15 / 17 / 18.5 (stories, line-height 1.66) / 20 (sections) / 24 (cover title) / 30 (day title) / 34 (page titles) / 52 (live km).

## Content rules

- French typography is applied to typed text by `typo()` in `src/lib/format.ts` (narrow no-break spaces before `? ! : ;`, inside « », between a number and its unit, before →).
- No ALL-CAPS labels, no middle-dot meta strings: details are joined with commas.
- Photos: the cover first, then rows of three and two, never a lone tile (`rowSizes()` in `Gallery.tsx`).

## Checking a change

`npm run dev`, then open `/?mock` (16 sample days), `/?mock&before` (before departure), `/?mock&slow` (loading state). Check a phone width (393 px) and a computer width (1440 px), light and dark, FR and EN.
