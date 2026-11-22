# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **First, the people close to me**: family and friends, in French and in English, of every age (grandparents included), following me day by day, mostly on a phone held upright (Safari on iPhone), often from the other side of the world. They want to know where I am today, see my days, photos, videos and voice notes, be told when a new day is up, ask me a question and write me a word. No account, no password, ever.
- **Then, brands and people who back me**: they sponsor a kilometre of the trail (at the price they choose, from 1 €, or for free if I accept) or give a "coup de pouce". They come through the same site, often from a link.
- **Me, publishing**: I write my days, answer questions and read the notes in the Carnet (`/admin/`), installed on my iPhone's Home Screen, often with no network. Every task there must be doable from an iPhone alone.

## Product Purpose

"Te Araroa avec moi": my trail journal online for the Te Araroa, South Island only, Ship Cove to Bluff, 1,334 km. My position on a 3D night map of the real trail, the stretch I walked, my days with their photos, videos and voice notes, the places along the way, my stats, my pack. Success: the people close to me open it and feel they walk with me; I publish a day in a few minutes from a hut; someone who wants to back me does it in a few taps.

## Positioning

Live and first-hand: my real position on the actual trail, drawn at night, with my own pictures, voice and words, day after day. Not a travel blog, not a generic tracker. Every picture on the site is mine.

## Operating Context

- Before I set off, the site shows the trail, the plan, my pack and a 30-second film; once I walk, a new day most evenings, published offline and sent when I find network.
- Visitors mostly come from a phone; also computers, tablets, phones held sideways. Some are not at ease with technology.
- New days are announced by Web Push (subscribing takes one tap, no account). My own alerts in the Carnet tell me about kilometres bought or asked for, gifts, notes, questions, new followers.
- Payments go through Stripe Checkout; free kilometres wait for my yes in the Carnet.

## Capabilities and Constraints

- Map: MapLibre 3D at night, relief, lakes, the trail to walk and the walked stretch, my point, places (huts, campsites, passes, peaks, water, transfers, resupply), satellite, flyover, "Ce que je vois".
- Tabs: Moi, Journal, Explorer, Stats; plus À propos, Questions, Mon sac, Parrainer (`#/parrainer`), the voyage in photos (`#/voyage`).
- Visitors can write me a note (only I read it), ask a question (shown once I answer), react, share, subscribe to new days.
- Sponsoring: kilometres only (paid, any price from 1 € with the amount adjustable on Stripe, or free on my approval), plus a free-amount gift.
- Static site on GitHub Pages (Vite, Preact with signals, TypeScript, plain CSS), Supabase (database, live feed, storage, edge functions), CSP, no secrets in the repository.
- French and English everywhere; French typography applied to typed text.
- Terminology: "le Carnet" (my admin), "Moi / Journal / Explorer / Stats", "Jour 12", "les tickets du sentier", "un coup de pouce", "tronçons" (the eight sections between trail towns).

## Brand Commitments

- Name: "Te Araroa avec moi" ("Te Araroa with me"). Mark: "TA" in type only with an orange point; the illustrated logo was dropped as "IA slop" and nothing explains the mark.
- Voice: the site speaks as me, in the first person, to "vous" / "you". Never my name or "il" / "he" in the site's words. The share text stays neutral.
- No stock photos: a picture means I took it.
- "Professional design", as I mean it: the level of the web components I chose (a liquid-glass navigation with WebGL water, glass folder cards, a curved band of images, a perspective tunnel of cards, links whose letters ripple), rewritten for this site rather than pasted, clear before clever, built without errors. 21st.dev is where I look for inspiration.

## Evidence on Hand

- Real: the trail and its places (OpenStreetMap, `web/public/data/pois.json`), the elevation profile (`web/public/data/profile.json`), the 30-second film, my pack list, my photos and days as I publish them, the kilometres actually sponsored.
- Absent, never to be made up: testimonials, press, partner logos, sponsor names, figures I did not walk.

## Product Principles

1. Where I am today, at a glance: the first screen answers it before anything else.
2. Clear before clever: every element says what it holds; effects serve a job.
3. Built for a grandmother on a phone: no account, plain words, big targets, readable at night.
4. Publishing from the trail stays quick and works offline.
5. Help is welcome, never pushed: sponsoring and gifts are offered quietly, at the foot, never in the way of following me.

## Accessibility & Inclusion

- Every control at least 44 × 44 px to the touch; VoiceOver reads what is written on a control first.
- Reduced motion and reduced transparency respected; small text at least 4.5:1 on the night background.
- French and English; no WebGL still shows where I am (a plain drawing of the trail).
