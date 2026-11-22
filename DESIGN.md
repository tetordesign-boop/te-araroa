---
name: Te Araroa avec moi
description: My Te Araroa, South Island, day by day, on a night map of the real trail.
colors:
  night: "#0C1526"
  night-deep: "#070E1B"
  surface-solid: "#111C30"
  sheet: "rgba(13, 21, 38, 0.84)"
  glass: "rgba(15, 24, 43, 0.72)"
  raise: "rgba(140, 170, 222, 0.085)"
  fill: "rgba(140, 170, 222, 0.11)"
  fill-2: "rgba(140, 170, 222, 0.2)"
  line: "rgba(150, 180, 228, 0.14)"
  ink: "#F3F6FB"
  ink-2: "#A9B6CC"
  ink-3: "#8292AD"
  story: "#E6ECF5"
  marker: "#FF6B12"
  marker-hot: "#FF8B3D"
  marker-tint: "rgba(255, 107, 18, 0.15)"
  on-marker: "#1A0A00"
  glacier: "#5CD6E6"
  glacier-tint: "rgba(92, 214, 230, 0.14)"
  on-glacier: "#04232A"
  hut: "#8B80FF"
  campsite: "#56E39F"
  pass: "#FF3D9A"
  peak: "#EAF2FF"
  water: "#4CC3FF"
  transfer: "#9AA8BE"
  town: "#E0B370"
typography:
  hero-number:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "70px"
    fontWeight: 860
    lineHeight: 0.86
    letterSpacing: "-0.045em"
    fontVariation: "'wdth' 125"
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 820
    lineHeight: 1.04
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 116"
  headline:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 760
    lineHeight: 1.2
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 110"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 450
    lineHeight: 1.35
  story:
    fontFamily: "Literata Variable, Literata, Georgia, serif"
    fontSize: "18.5px"
    fontWeight: 450
    lineHeight: 1.68
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 450
    lineHeight: 1.5
rounded:
  sheet: "28px"
  card: "20px"
  field: "14px"
  tile: "12px"
  pill: "999px"
spacing:
  gutter: "20px"
  nav-height: "62px"
  panel-width: "432px"
components:
  button-primary:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.on-marker}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  field:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "14px 15px"
  chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 13px 0 8px"
    height: "36px"
  chip-on:
    backgroundColor: "{colors.glacier-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  list:
    backgroundColor: "{colors.raise}"
    rounded: "{rounded.card}"
  list-row:
    textColor: "{colors.ink}"
    padding: "10px 14px 10px 10px"
    height: "72px"
---

# Design System: Te Araroa avec moi

## Overview

**Creative North Star: "La nuit du Mackenzie"**

The site is the Mackenzie basin at night, under the dark-sky reserve over Tekapo: a navy map with relief lit as if by the moon and glacier lakes glowing turquoise, and one warm light in it, mine. The walked trail is a lit tube of track-marker orange (the orange triangles nailed to every post of the Te Araroa), my point glows, the day you open lights up its stretch. Everything else stays in the cold of the night.

The structure is Apple Plans': the map full screen, a glass sheet with heights on a phone, a floating panel beside the map on a computer. Glass is the chrome; what sits inside the sheet is solid and calm. Two voices share the page: the site measures and labels in Archivo, stretched wide like a race bib, and my own words (days, stories, captions) and the notes people send me are set in Literata. Motion answers touch; one orchestrated moment on arrival, nothing else moves on its own.

The level of craft is the one I set with five web components I chose (a liquid-glass navigation with WebGL water, glass folder cards, a curved band of images, a perspective tunnel of cards, links whose letters ripple): each rewritten for this site, given a job, drawn in the night palette, and clear before clever. No stock photos: a picture means I took it.

**Key Characteristics:**
- Night map, lit trail; the only warm colour is mine.
- Orange means me, turquoise means the map.
- Glass for the chrome, solid surfaces for the content, both catching the same light on their top edge.
- Wide, heavy numbers for what I walked; a book face for what I wrote.
- Every touch answers; nothing moves unasked.

## Colors

Cold navy night with two lights: my orange, the lakes' turquoise.

### Primary
- **Track-Marker Orange** (`marker`): where I walked and where I am, my days, the actions about me (subscribe, write to me, sponsor). On navy, orange text uses **Ember** (`marker-hot`, 7.8:1); text on an orange button is **Ash Brown** (`on-marker`). A pressed orange button deepens (#E85D08).

### Secondary
- **Tekapo Turquoise** (`glacier`): the map's own world: its controls, search, the open place, the selected filter, focus rings. Text on it is **Deep Lake** (`on-glacier`).

### Tertiary
The kinds of places, only on the map and in its lists, each a bright disk with a navy glyph and a soft glow of its own colour: **Hut Violet** (`hut`), **Camp Green** (`campsite`), **Pass Magenta** (`pass`), **Snow White** (`peak`), **Waterfall Blue** (`water`), **Ferry Grey** (`transfer`), **Town Gold** (`town`). They appear from a zoom of their own: huts 9.2, campsites 10.5, passes 9.8, peaks 8.4 (from 2,400 m) to 12, waterfalls and viewpoints 11.5 and 12, transfers 6.5. Checked against each other for protanopia, deuteranopia and tritanopia (worst pair ΔE ≈ 14, camp vs town, which never meet); the glyph always says the kind too.

### Neutral
- **Mackenzie Night** (`night`): the base; **Deep Night** (`night-deep`) behind the app.
- **Sheet Night** (`sheet`, blur 22 to 32 px, saturate 1.45) and **Control Glass** (`glass`, blur 16 px, saturate 1.7): the two glass tints. **Solid Night** (`surface-solid`) where blur is unavailable or transparency is reduced.
- **Platter** (`raise`): lists, shelves, actions. **Fill** (`fill`, `fill-2` pressed): buttons, fields, segmented controls. **Hairline** (`line`): separators.
- **Starlight** (`ink`), **Mist** (`ink-2`, 7.9:1) for secondary text, **Dusk** (`ink-3`, at least 4.5:1 on every night surface, raised fields included) for the least important, **Page White** (`story`) for long reading, a touch softer than white.

The map's own palette (`web/src/map/style.ts`): land by altitude #0F1A2C up to #6F8AAD at 3,400 m; shaded relief shadow #01040B, highlight #7E9FCC (warm at golden hour with "Lumière du moment"); forest #0E2B2E; ice #BCD3F0 at 50 %; sea #060D19; lakes #0D7487 with a #5CD6E6 shoreline; rivers #2AA9BE; the trail to walk #C3D2EA at 62 %, walked #FF6B12 with a glow and a #FFD9BD core.

**The One Warm Light Rule.** Orange belongs to me alone: my trail, my point, my days, the actions about me. Nothing decorative is orange, and no other warm colour enters the night.

**The Two Lights Rule.** Turquoise is the map's; orange is mine. A control is turquoise when it acts on the map, orange when it is about me. Nothing else gets colour, except the kinds of places.

## Typography

**Display Font:** Archivo Variable (with Archivo, the system sans), stretched with `font-stretch` 106 to 125 %
**Body Font:** Archivo Variable at weight 450
**Voice Font:** Literata Variable (with Georgia), optical sizing on

**Character:** A race bib and a notebook. The site's own words and every figure are Archivo, heavy and wide; everything I wrote, and the notes people write to me, is Literata, unhurried.

### Hierarchy
- **Hero number** (860, 70 px, 0.86, width 125 %): the kilometres I walked, the stats' big figures (64 px). The kilometres are the hero.
- **Display** (820, 32 px, 1.04, width 116 %, balanced): page titles; place titles 28 px.
- **Headline** (600, 30 px, 1.14): a day's title, in my words.
- **Title** (760, 20 px, 1.2, width 110 %): section titles inside a page.
- **Body** (450, 16 px, 1.35): the interface; list titles 17 px at 550.
- **Story** (Literata 450, 18.5 px, 1.68, 62ch max): my days, captions, introductions.
- **Label** (450, 13 px, 1.5, Mist): fine print and captions; axis and figure labels 12.5 px.

Scale used: 12.5 / 13 / 14 / 15 / 16 / 17 / 18.5 / 20 / 24 / 28 / 30 / 32 / 64 / 70.

The Archivo face is preloaded with the page (`preloadFonts()` in `vite.config.ts`); the presentation's words wait for their fonts, 1.5 s at most, rather than come in with stand-ins and jump.

**The Two Voices Rule.** If I wrote it, it's Literata; if the site says or measures it, it's Archivo. Never the other way round.

**The Bib Rule.** Figures are wide and heavy, with tabular numerals where they line up. Past 1,000 km the hero number narrows by its final figure so it never jumps while counting up.

**The French Typography Rule.** Narrow no-break spaces before `? ! : ;`, inside « », between a number and its unit, before →, applied by `typo()` and `t()`. Archivo and Literata lack the narrow no-break space, so a one-character font ("Te Araroa Fine", 0.15 em, `unicode-range` limited) comes first in both stacks. No ALL-CAPS labels, no middle-dot meta strings: details are joined with commas and a km figure comes last ("Refuge, 1 310 m, km 280"); ranges use an en dash ("Havelock – St Arnaud"). Elevations read from the profile rather than the map data are marked "≈".

## Layout

- **Phone held upright:** the map full screen and the sheet over it, full width, with four heights: full, half, peek (300 px visible), and "map", where only its grip shows above the navigation. Content keeps a 20 px gutter. Under 360 px the hero number and the day's figures shrink or go two by two rather than collide.
- **Phone held sideways:** a sheet would cover the whole screen, so the computer's panel comes in, narrower, with the map beside it (`PANEL_MQ` in `ui/state.ts`, the same query as the `@media` rules).
- **Tablet upright (600 to 899 px):** the sheet becomes a card on the left, 468 px at most, keeping its heights; the map stays in view.
- **Computer and tablet sideways:** a floating panel, 432 px, beside the map.
- **Navigation:** a pill floating at the bottom on a phone (62 px tall, 420 px at most), at the foot of the panel or card elsewhere. The sheet's content fades out under it.
- **No WebGL 2:** a plain drawing of the trail with what I walked, where I am and the main towns (`ui/MapFallback.tsx`); the buttons that need the map go away.
- **The map never moves when the sheet does:** the new padding applies in place; only the next flight frames things in the free part.
- **Photos:** the cover first, then rows of three and two, never a lone tile (`rowSizes()` in `Gallery.tsx`).

**The Free Map Rule.** Whatever the sheet does, the part of the map left visible stays the map's: no control parks there that the sheet already offers.

## Elevation & Depth

Depth comes from glass over the map and from light on edges, not from stacked shadows. The sheet and floating controls are glass with a rim of light brightest upper left, faint along the sides, picking up again lower right, like a bevel catching light. Solid surfaces inside the sheet catch the same light on their top edge only. Shadows are soft, offset downward, and reserved for what floats over the map.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.75), 0 1px 2px rgba(0, 0, 0, 0.4)`): floating controls, pills and cards over the map.
- **Sheet** (`box-shadow: 0 -2px 40px -8px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.4)`): the sheet's lift off the map.
- **Lit edge** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.075)`, under a mouse `0.14`): lists, cards, actions, fields, chips, round buttons, segmented controls.
- **Glass rim** (a 1 px gradient border, `rgba(226, 236, 255, 0.5)` to `0.07` to `0.24` at 135°): every glass surface.
- **Drop of light** (`inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 rgba(90, 20, 0, 0.28), 0 10px 24px -10px rgba(255, 107, 18, 0.5)` over a top-to-bottom sheen): the orange buttons, lit from above, deeper below.

**The Glass Is Chrome Rule.** Glass is for what floats over the map (the sheet, the panel, the floating buttons, the cards and pills on the map, the navigation, the toast, the photo viewer's buttons). Content inside the sheet is solid. Glass never decorates.

**The Blur Budget Rule.** Each blur is redrawn whenever what lies under it changes, and under the sheet the map moves constantly: the chrome blurs 16 px, the sheet 22 px; on a phone, glass lying on the already frosted sheet (the navigation, the folders) uses a denser tint instead of a second blur. Reduced transparency: solid surfaces, no blur, the same rims.

## Shapes

Soft, generous corners that nest: the sheet 28 px, cards and lists 20 px, fields 14 px, thumbnails and tiles 12 px, buttons, chips, the navigation and segmented controls fully round. Hairlines separate list rows, inset past the thumbnail. Tickets of the trail are the one shape with notches: a perforated stub with a punched half-circle on each side.

## Components

### Buttons
- **Shape:** fully round (999 px), 50 px tall, 22 px inline padding, Archivo 700 at 16.5 px, width 106 %.
- **Primary:** Track-Marker Orange with Ash Brown text and the drop-of-light sheen; used for the one action about me on a screen.
- **Default:** Fill with Starlight text and the lit edge.
- **Press:** everything pressed gives a little and springs back (`--spring`); hover on a mouse lifts toward you (lighter, brighter edge).
- **Focus:** a 2.5 px turquoise ring, offset 2 px.

### Chips
- **Style:** Fill, Mist text, 36 px, fully round, a coloured place badge leading.
- **State:** on, a turquoise tint with a 1.5 px turquoise ring and Starlight text; off, the badge greys out and shrinks.

### Lists
- **Corner Style:** 20 px, Platter background, lit edge.
- **Rows:** 72 px minimum, a 52 px thumbnail (12 px corners), title 17 px at 550, meta in Mist, a chevron at rest and brighter when lit.

### Inputs / Fields
- **Style:** Fill, 14 px corners, 17 px text, a hairline ring inside.
- **Focus:** a 2 px orange ring inside and a 4 px orange tint outside; the caret is orange.
- **Error:** a missing field shakes and takes the focus; the message sits next to the button and names the fix.

### Navigation
"Moi, Journal, Explorer, Stats" in a pill of night glass with a drop of lake water for the current tab (`ui/LiquidNav.tsx`, after "Waterline"). The water is a WebGL shader drawn only inside the pill: the drop stretches toward the tab touched, splits into droplets on a long jump and lands with a ripple; it calms a few seconds after a touch and stops drawing. Without WebGL, a CSS drop moved by the same springs. Each icon plays its own scene (my point pings, a page turns, the compass swings, the bars rise); the sound is a drop of water, higher for each tab. A day belongs to Journal, a place to Explorer, "À propos" to none (the drop evaporates). The current tab touched again goes back to its top. The pill steps aside during the presentation, the flyover, the voyage, and while typing on a phone.

### The sheet, and the map under the finger
- The sheet is positioned by script (`ui/Sheet.tsx`): no render while dragging, a spring integrated on real time, velocity from the events' own timestamps, a rubber band past its ends, a clear flick always moves one height. Fully open, the content scrolls and pulls the sheet down once back at the top. A swipe down from peek, or the map's own button, takes it to "map"; a tap on the grip, the strip or a tab brings it back.
- A press may wander 10 px (finger) or 5 px (mouse) and still be a tap: buttons are never swallowed by a would-be drag; a gesture the browser takes over (a sideways swipe on a shelf) is not a tap either.
- Taps on the map look 22 px around the finger and take the place drawn closest; a tap on nothing closes the place card. On touch screens the map ignores the first 7 px a finger wobbles.
- The page itself never zooms on a phone (the map and the photos do); holding a control doesn't select its words or open a link preview.

### Segmented controls
The raised selection slides and squashes on its way (`ui/Seg.tsx`: the language, the Carnet's kind of day).

### The presentation
On a first visit to the plain address (never on a link to a day, a place or the flyover), the island at night sways slowly under the title while a light runs the whole trail from Ship Cove to Bluff, again and again; the words say where I am today, so nobody has to go in to know. A tap anywhere, Enter or Escape goes in: the words lift away, the sheet rises, and the arrival plays. It can be watched again from "À propos". Reduced motion: the same screen, still.

### Albums: the glass folders
`ui/TrailSections.tsx` and `ui/GlassFolder.tsx`, after "Glass Folder Cards": in the journal, "Les photos, tronçon par tronçon", eight sections between trail towns as a shelf of smoked-glass folders hinged on their bottom edge. Every photo or video I publish files itself in the section where it was taken. Its files are prints; four show, the latest in front. A tap opens the folder (the glass falls, the files fan out); a print opens the whole album full screen. Before I get there, the files are empty frames named after the passes and huts to come. The section I'm on says I'm here and the shelf opens on it. Until a folder has a photo, its picture is generated from its landscape's colours.

### The journal's days
On the home page the latest day's card ends with "Voir le jour" and an arrow. `LogItem` in `ui/Pages.tsx`, after "Interactive Hover Links": the days on the trail's spine, each a link that answers. Lit, the title's letters ripple, the day's photo springs up tilted like a print, an arrow slides in and the day's station lights orange. A mouse lights the row under it; the keyboard the row it's on; on a phone, the row at the reading line lights once the list settles. A day page shows "‹ Jour 12 ›" and a sideways swipe turns the day.

### The journey in photos
At the top of the journal, from three photos on (`ui/PhotoBand.tsx`, after "Tilted Grid Hero"): two dozen photos stream round the inside of a cylinder, pausing off screen. Its button opens the voyage (`ui/PhotoTunnel.tsx`, after "Perspective Tunnel Hero", `#/voyage`): every photo coming out of the night toward you, with the day written over them and a progress bar to touch.

### Notes to me
"Écrivez-moi un mot" (`ui/NoteToEwan.tsx`), at the foot of the home page and of every day: family and friends write to me, and only I read the notes, in the Carnet; nothing is listed or counted on the site and the database lets no visitor read them back. The section says so in its first line; after sending, the sender sees their own words once, as a receipt. The name and the note have visible labels (a placeholder only gives an example); ⌘/Ctrl + Enter sends.

### My pack
`ui/Pack.tsx`, `#/sac`: it opens on the base weight (set like the stats' big line), then my photo of everything laid out, the other figures, a ladder of orange bars, "Où partent les grammes" (each bar scrolls to its section and lights its title), then the list in grams, worn things tagged "porté". The page and its ways in appear only once the list has an item.

### Tickets of the trail
`ui/Sponsors.tsx`, `#/parrainer`: the whole trail as its skyline; a finger slides along it, an orange cursor follows with the km, the place and the height, holding on to a pass when near one; let go and the kilometre's ticket comes out of a slot, foil catching the light. "Je veux ce ticket" opens the form inside the ticket's stub: a price from 1 € paid on Stripe, or a free request I answer. With the whole island in view, a sponsor's coin on the map is half its size and sits on its spot, so it never hides a town's name. At the foot, "Un coup de pouce": amounts as chips and a free amount.

### The brand: "TA" and the point
Type only: "TA" in Archivo 900 at its widest and an orange point, the same point that shows me on the map (`Mark` in `ui/icons.tsx`, sized by its font size): above the presentation's title, and turned round (dark on orange) on the Carnet's sign-in; the brand pill is the name alone with the orange point after it. `scripts/brand/` renders the app icons (night for the site, orange for the Carnet, so I tell my two apps apart), the maskable icon and the link preview. The icons keep their file names; the service worker serves them stale-while-revalidate. Nothing explains the mark.

### Icons
Drawn SVG in one stroke family; every icon has a scene (`ui/iconfx.ts`): the eye blinks, play and chevrons step the way they point, a close cross turns away, the share arrow lifts, the search glass tilts. No emoji or typed glyph stands in for an icon.

## Do's and Don'ts

### Do:
- **Do** keep orange for me (my trail, point, days and the actions about me) and turquoise for the map.
- **Do** make every control a 44 × 44 px target, even when drawn smaller (an invisible `::before` margin).
- **Do** let VoiceOver read what is written on a control first, then what it does.
- **Do** use the spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for anything let go and `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`) for arrivals, at 160 ms for feedback, 320 ms for a change, 600 ms for an entrance; exits faster than entrances.
- **Do** keep one orchestrated moment: on arrival the trail draws itself from Ship Cove while my kilometres count up, I land with a ping and the camera dives to me. The presentation on a first visit runs once. Camera shows start only when asked, and touching the map always wins.
- **Do** give an empty screen something true to show and one thing to do (before the first day, Stats shows what lies ahead from the trail's own data, and Journal and Stats offer to be told of each new day).
- **Do** give every state an answer: a missing field shakes and takes the focus, a note sent draws its tick and comes back as a receipt, the parts nobody draws (caret, selection, underline offset) take the palette.
- **Do** honour reduced motion (no scenes, no squash, the band stands still) and reduced transparency (solid surfaces, no blur).
- **Do** speak in the first person, to "vous" / "you", in plain words a grandmother understands.

### Don't:
- **Don't** use stock photos or illustrations standing in for mine; an empty state says what will come.
- **Don't** put ALL-CAPS labels, eyebrows above headings, or middle-dot meta strings anywhere.
- **Don't** blur twice: glass on frosted glass takes a denser tint instead.
- **Don't** animate at rest: my point pulses four times on a new position, then stops; the navigation's water calms within seconds.
- **Don't** let anything decorative be orange.
- **Don't** explain the logo, and don't bring back an illustrated one.
- **Don't** add an emoji or a typed glyph where an icon belongs.

## Sounds

`src/lib/sound.ts`: synthesised with Web Audio, one small family of soft tones. A tap is a wooden tock; links open with two rising notes and close with two falling ones; switches say on or off; a place touched on the map is a bubble (huts low, summits high); the sheet settling is a low thud; a reaction sparkles; a note sent is a warm chord; going in from the presentation chimes; my landing at the end of the arrival pings, far away. Buttons name their sound with `data-sfx`. Quiet, one at a time, ambient audio session on iPhone; a switch in "À propos" turns them off.

## Keeping it smooth on a phone

Measured in November 2026 on a 3× phone screen, with the gestures a visitor makes:

- The map draws at 2 device pixels per CSS pixel at most; multisampling only under 2×.
- Dragging the sheet updates only what rides on it (`--sheet-visible`) and the page once it rests.
- No 3D relief from afar: terrain off below zoom 7.6, back from 8.2.
- Visitors download only the parts of Supabase the site uses; albums and the voyage load once the page has settled; the Carnet starts without the map engine.
- Formatting objects are cached; the map's padding is applied after the sheet settles; art is painted in a worker.

## Checking a change

`npm run dev`, then `/?mock` (16 sample days), `/?mock&before` (before departure), `/?mock&slow` (loading). Without the tile servers, add `&offline-map`. Check 393 px and 320 px phones, a phone sideways (852 × 393), an iPad (820 × 1180) and 1440 px, in French and English, with reduced motion; without WebGL the plain drawing must say where I am. Screenshots on the real map: push to `bot/qa`; the "Captures de contrôle" workflow publishes them on `bot/qa-out` (`scripts/qa/shots.mjs`).
