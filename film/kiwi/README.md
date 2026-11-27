# Le kiwi et l'île — source of the second film

A 51 s 2D-anime short (three.js WebGL2 in headless Chromium, painted multiplane backgrounds with a Kuwahara brush
pass, cel shading + ink lines, impact frames, an orchestral CC0 score). The finished files are in `web/public/film/kiwi-*`.

- `CONTRACT.md`: the production rules and module interfaces. `src/shots.js`: the shot list, cut to 90 BPM.
- `src/core`: renderer, passes, title, checks. `src/world`, `src/kiwi`, `src/fx`: scenery, the kiwi, effects.
- `render/preview.mjs` (a few frames), `render/check.mjs` (feet / camera / pop checks with three-mesh-bvh),
  `render/render.mjs` (full render: one MP4 per shot, concat, then the score). Needs Node, Playwright's Chromium, ffmpeg.
- `sound/score.py`: the score (Python + numpy/scipy) from the VSCO-2-CE samples (CC0, not included: clone
  github.com/sgossner/VSCO-2-CE to `/home/claude/ext-vsco/repo` or change the path in `sound/lib.py`).
- `data/nz.json`: Natural Earth 10 m coastline (public domain). `data/trail.json`: the site's trail. `assets/`: Archivo (OFL).

Phone master (what the site's files carry): `sound/score.wav` through
`highpass=f=70,equalizer=f=200:t=q:w=1:g=-2,equalizer=f=2800:t=q:w=1.2:g=4,equalizer=f=7000:t=q:w=1:g=2,acompressor=threshold=-26dB:ratio=3:attack=8:release=250:makeup=4:knee=6,alimiter=limit=0.84:attack=4:release=60:level=disabled`,
then a gain to -14 LUFS and a last `alimiter=limit=0.87` (peaks -1 dBFS); muxed with `-c:v copy -c:a aac -b:a 160k`.
