// The brand image, "Le sentier, la nuit": Ewan seen from behind on the trail, his orange pack and rolled mat, the
// orange triangle of a Te Araroa marker on its post, a glacier lake, the Southern Alps under the stars (the Southern
// Cross among them). Behind him the trail he has walked glows orange, as it does on the map. A 1000 x 1000 SVG drawn
// from a fixed seed, so it comes out the same every time; variant "night" (the site) or "dusk" (the Carnet).
// Used by scripts/brand/icons.mjs (app icons, favicon, the site's images) and scripts/brand/og.mjs (link preview).

/** Square crops of the scene: the whole of it, the app icon around Ewan, the maskable icon (wider, for the safe
 * circle), and his back with the pack for 16 to 48 pixels (favicon, the round logo in the brand pill). */
export const CROPS = { full: [0, 0, 1000, 1000], tile: [140, 200, 760, 760], mask: [40, 130, 920, 920], face: [335, 430, 340, 340] };

/** The scene as an SVG document, cropped and sized for rendering (grain: the fine paper grain; PNG files are much
 * smaller without it, and at icon sizes it does not show). */
export function sceneSvg({ variant = "night", crop = "full", size = 1000, grain = true } = {}) {
  return scene({ variant, grain }).replace('viewBox="0 0 1000 1000"', `viewBox="${CROPS[crop].join(" ")}" width="${size}" height="${size}"`);
}

// ------------------------------------------------------------------ randomness, fixed
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f1 = (n) => Math.round(n * 10) / 10;
const pts = (a) => a.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L");

// a ridge through control points, roughened by midpoint displacement
function ridge(ctrl, rough, depth, r) {
  let p = ctrl.map((q) => [...q]);
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const out = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1], [x1, y1] = p[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      out.push([(x0 + x1) / 2 + (r() - 0.5) * amp * 0.3, (y0 + y1) / 2 + (r() - 0.5) * amp * Math.min(1, len / 60)], p[i]);
    }
    p = out; amp *= 0.56;
  }
  return p;
}

// ------------------------------------------------------------------ palettes
const PAL = {
  night: {
    sky: ["#030914", "#081429", "#12264A", "#24426F"], glow: "#4C78B8", glowOp: 0.38,
    stars: true, star: "#EAF2FF",
    farLit: "#46607F", farShade: "#25395A", snowLit: "#E3ECF8", snowShade: "#8FA6C9", haze: "#1D375E",
    nearLit: "#2C4669", nearShade: "#18294A",
    midLit: "#1F3555", midShade: "#132440",
    lake: ["#0B5F70", "#1E9DB2", "#0B5F70"], lakeHi: "#9BEAF4", refl: "#58C9DA",
    ground: ["#0E1B2E", "#081221"], tussock: ["#4A5642", "#6C6B4C", "#837B57", "#3B4637"],
    path: "#B9C8DF", pathOp: 0.5, rim: "#CFE0FF",
  },
  dusk: {
    sky: ["#1B1033", "#4A1F45", "#B84A3A", "#FF8A3D"], glow: "#FFB36B", glowOp: 0.55,
    stars: true, star: "#FFF1E0",
    farLit: "#6A4A6E", farShade: "#3B2A4D", snowLit: "#FFD9C2", snowShade: "#B98AA3", haze: "#5A2E4E",
    nearLit: "#4A3355", nearShade: "#2D2040",
    midLit: "#3A2847", midShade: "#251B36",
    lake: ["#3E2A4F", "#E9824B", "#3E2A4F"], lakeHi: "#FFD2A8", refl: "#FFB27A",
    ground: ["#1C1428", "#120D1C"], tussock: ["#5A4A44", "#7D6650", "#9C7E5C", "#4A3C3C"],
    path: "#E9C9B7", pathOp: 0.45, rim: "#FFD6B8",
  },
};

export function scene({ variant = "night", seed = 7, grain = true } = {}) {
  const P = PAL[variant];
  const r = rng(seed);
  const defs = [];
  const layers = [];

  // ---------------------------------------------------------------- sky
  defs.push(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.sky[0]}"/><stop offset=".32" stop-color="${P.sky[1]}"/><stop offset=".55" stop-color="${P.sky[2]}"/><stop offset=".64" stop-color="${P.sky[3]}"/></linearGradient>
  <radialGradient id="glow" cx="66%" cy="50%" r="48%"><stop offset="0" stop-color="${P.glow}" stop-opacity="${P.glowOp}"/><stop offset="1" stop-color="${P.glow}" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>`);
  layers.push(`<rect width="1000" height="1000" fill="url(#sky)"/><rect width="1000" height="700" fill="url(#glow)"/>`);

  // the Milky Way: a faint band, and the stars, thicker along it
  if (P.stars) {
    layers.push(`<ellipse cx="520" cy="250" rx="640" ry="70" transform="rotate(-24 520 250)" fill="${P.star}" opacity="${variant === "night" ? 0.09 : 0.03}" filter="url(#blur30)"/>`);
    const stars = [];
    const n = variant === "night" ? 330 : 120;
    for (let i = 0; i < n; i++) {
      let x = r() * 1000, y = Math.pow(r(), 1.5) * 560;
      if (i % 3 === 0) { // along the band
        const t = r() * 1200 - 80; const along = [t * Math.cos(-24 * Math.PI / 180), t * Math.sin(-24 * Math.PI / 180)];
        x = 520 - 600 * Math.cos(-24 * Math.PI / 180) + along[0] + (r() - 0.5) * 120; y = 250 + 270 + along[1] + (r() - 0.5) * 110;
      }
      if (y > 560 || x < 0 || x > 1000) continue;
      const big = r() < 0.035;
      const rad = big ? 1.6 + r() * 1.2 : 0.45 + r() * 1.05;
      const op = (0.35 + r() * 0.65) * Math.min(1, (560 - y) / 160);
      const col = r() < 0.12 ? "#FFE3C4" : r() < 0.2 ? "#C9DEFF" : P.star;
      if (big) stars.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad * 3.2)}" fill="${col}" opacity="${(op * 0.35).toFixed(2)}" filter="url(#soft)"/>`);
      stars.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${rad.toFixed(2)}" fill="${col}" opacity="${op.toFixed(2)}"/>`);
    }
    // the Southern Cross, small, high on the right: it shows walkers the way south
    const cross = [[48.82, 12.96, 2.3], [55.87, 87.19, 2.7], [23.24, 44.9, 2.45], [73.58, 33.25, 1.7], [63.97, 53.73, 0.9]];
    for (const [cx, cy, cr] of cross) {
      const x = 790 + cx * 0.95, y = 70 + cy * 0.95;
      stars.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${cr * 3}" fill="${P.star}" opacity=".3" filter="url(#soft)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${cr}" fill="${P.star}"/>`);
    }
    layers.push(`<g>${stars.join("")}</g>`);
  }

  // ---------------------------------------------------------------- the far range: snow, lit on the right of each peak
  const far = ridge([[-60, 570], [60, 480], [150, 505], [250, 400], [330, 350], [395, 272], [455, 368], [540, 340], [620, 395], [700, 335], [790, 410], [880, 380], [960, 450], [1060, 480]], 70, 6, r);
  const base = 690;
  const farShape = `M-60 ${base}L${pts(far)}L1060 ${base}Z`;
  // peaks: local maxima (smallest y) far enough apart
  const peaks = [];
  for (let i = 2; i < far.length - 2; i++) if (far[i][1] < far[i - 1][1] && far[i][1] <= far[i + 1][1] && far[i][1] < 520) peaks.push(i);
  const kept = [];
  for (const i of peaks) { if (!kept.length || far[i][0] - far[kept[kept.length - 1]][0] > 34) kept.push(i); else if (far[i][1] < far[kept[kept.length - 1]][1]) kept[kept.length - 1] = i; }
  // lit faces: from each peak, along the ridge down to the next valley, then down a rough spur back to below the peak
  const lit = [];
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k], j = k + 1 < kept.length ? kept[k + 1] : far.length - 1;
    let v = i; for (let m = i; m <= j; m++) if (far[m][1] > far[v][1]) v = m; // the valley after the peak
    const [px, py] = far[i];
    const spur = ridge([[px, py], [px + 40 + r() * 50, py + (base - py) * 0.55], [px + 70 + r() * 70, base]], 22, 4, r);
    // (from the valley the face runs down slantwise too: no vertical edges)
    lit.push(`M${pts(far.slice(i, v + 1))}L${f1(far[v][0] + (base - far[v][1]) * 0.7)} ${base}L${pts(spur.slice().reverse())}Z`);
  }
  // the snowline, rough
  const snow = ridge([[-60, 445], [200, 470], [400, 430], [600, 460], [800, 450], [1060, 480]], 60, 6, r);
  const snowClip = `M-60 -10L1060 -10L1060 ${f1(snow[snow.length - 1][1])}L${pts(snow.slice().reverse())}Z`;
  defs.push(`<clipPath id="snow"><path d="${snowClip}"/></clipPath><clipPath id="farclip"><path d="${farShape}"/></clipPath>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.haze}" stop-opacity="0"/><stop offset=".55" stop-color="${P.haze}" stop-opacity=".7"/><stop offset="1" stop-color="${P.haze}" stop-opacity="1"/></linearGradient>`);
  // couloirs: snow streaks running down from the snowline
  const streaks = [];
  for (let s = 0; s < 12; s++) {
    const x = r() * 1000; const y0 = 395 + r() * 50; const len = 10 + r() * 24; const w = 1 + r() * 1.6;
    const pth = ridge([[x, y0], [x + (r() - 0.5) * 30, y0 + len]], 10, 3, r);
    streaks.push(`<path d="M${pts(pth)}" stroke="${r() < 0.6 ? P.snowShade : P.snowLit}" stroke-width="${w.toFixed(1)}" stroke-linecap="round" fill="none" opacity="${(0.18 + r() * 0.25).toFixed(2)}"/>`);
  }
  layers.push(`<g>
    <path d="${farShape}" fill="${P.farShade}"/>
    <path d="${lit.join("")}" fill="${P.farLit}" clip-path="url(#farclip)"/>
    <g clip-path="url(#farclip)">
      <g clip-path="url(#snow)"><path d="${farShape}" fill="${P.snowShade}"/><path d="${lit.join("")}" fill="${P.snowLit}"/></g>
      ${streaks.join("")}
      <rect x="-60" y="430" width="1120" height="${base - 430}" fill="url(#haze)"/>
    </g>
  </g>`);

  // ---------------------------------------------------------------- a nearer range, darker, a little snow on its tops
  const near = ridge([[-60, 565], [70, 515], [170, 545], [270, 475], [360, 533], [470, 500], [600, 545], [700, 490], [800, 523], [900, 475], [1060, 515]], 40, 6, r);
  const nearBase = 705;
  const nearShape = `M-60 ${nearBase}L${pts(near)}L1060 ${nearBase}Z`;
  const nearLit = [];
  for (let i = 2; i < near.length - 2; i++) {
    if (!(near[i][1] < near[i - 1][1] && near[i][1] <= near[i + 1][1])) continue;
    let v = i; for (let m = i; m < Math.min(near.length, i + 30); m++) { if (near[m][1] > near[v][1]) v = m; if (m > i + 2 && near[m][1] < near[i][1] - 4) break; }
    const [px, py] = near[i];
    const spur = ridge([[px, py], [px + 30 + r() * 40, py + (nearBase - py) * 0.6], [px + 50 + r() * 60, nearBase]], 16, 4, r);
    nearLit.push(`M${pts(near.slice(i, v + 1))}L${f1(near[v][0] + (nearBase - near[v][1]) * 0.7)} ${nearBase}L${pts(spur.slice().reverse())}Z`);
  }
  const nearSnow = ridge([[-60, 523], [300, 513], [600, 521], [1060, 507]], 26, 5, r);
  defs.push(`<clipPath id="nearclip"><path d="${nearShape}"/></clipPath><clipPath id="nearsnow"><path d="M-60 -10L1060 -10L1060 ${f1(nearSnow[nearSnow.length - 1][1])}L${pts(nearSnow.slice().reverse())}Z"/></clipPath>`);
  layers.push(`<g>
    <path d="${nearShape}" fill="${P.nearShade}"/>
    <path d="${nearLit.join("")}" fill="${P.nearLit}" clip-path="url(#nearclip)"/>
    <g clip-path="url(#nearclip)"><g clip-path="url(#nearsnow)"><path d="${nearShape}" fill="${P.snowShade}" opacity=".8"/><path d="${nearLit.join("")}" fill="${P.snowLit}" opacity=".85"/></g>
      <rect x="-60" y="515" width="1120" height="${nearBase - 515}" fill="url(#haze)" opacity=".75"/></g>
  </g>`);

  // ---------------------------------------------------------------- the middle hills
  const mid = ridge([[-60, 620], [120, 580], [260, 610], [380, 625], [520, 615], [640, 587], [760, 565], [880, 595], [1060, 575]], 34, 6, r);
  const midShape = `M-60 735L${pts(mid)}L1060 735Z`;
  const midLit = [];
  for (let i = 1; i < mid.length; i++) if (mid[i][1] > mid[i - 1][1]) midLit.push(`M${pts([mid[i - 1], mid[i]])}L${f1(mid[i][0] + (735 - mid[i][1]) * 0.7)} 735L${f1(mid[i - 1][0] + (735 - mid[i - 1][1]) * 0.7)} 735Z`);
  layers.push(`<path d="${midShape}" fill="${P.midShade}"/><path d="${midLit.join("")}" fill="${P.midLit}" opacity=".55"/>`);

  // ---------------------------------------------------------------- the lake, glowing like the glacier lakes on the map
  defs.push(`<linearGradient id="lake" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.lake[0]}"/><stop offset=".55" stop-color="${P.lake[1]}"/><stop offset="1" stop-color="${P.lake[2]}"/></linearGradient>
  <clipPath id="lakeclip"><path d="M-60 640C200 633 420 649 640 637C800 629 940 641 1060 635L1060 712L-60 712Z"/></clipPath>`);
  const refl = far.map(([x, y]) => [x, 640 + (base - y) * 0.16]);
  const shimmer = [];
  for (let s = 0; s < 26; s++) { const y = 645 + r() * 60, x = r() * 1000, w = 20 + r() * 110; shimmer.push(`<path d="M${f1(x)} ${f1(y)}h${f1(w)}" stroke="${P.lakeHi}" stroke-width="${(0.8 + r() * 1.4).toFixed(1)}" stroke-linecap="round" opacity="${(0.12 + r() * 0.3).toFixed(2)}"/>`); }
  layers.push(`<g clip-path="url(#lakeclip)">
    <rect x="-60" y="626" width="1120" height="92" fill="url(#lake)"/>
    <path d="M-60 640L${pts(refl)}L1060 640Z" fill="${P.refl}" opacity=".22" filter="url(#soft)"/>
    ${shimmer.join("")}
  </g>`);

  // ---------------------------------------------------------------- the ground: tussock hills in the moonlight
  defs.push(`<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.ground[0]}"/><stop offset="1" stop-color="${P.ground[1]}"/></linearGradient>`);
  const groundTop = ridge([[-60, 706], [180, 690], [360, 702], [520, 688], [700, 678], [860, 690], [1060, 674]], 16, 5, r);
  layers.push(`<path d="M-60 1060L${pts(groundTop)}L1060 1060Z" fill="url(#ground)"/>`);

  // the trail: from the bottom edge, past Ewan, to the lake shore (perspective: it narrows away)
  const centre = [[548, 1012], [596, 948], [566, 898], [505, 860], [516, 806], [566, 760], [616, 726], [644, 704]];
  const widthAt = (y) => 4 + Math.pow(Math.max(0, y - 694) / 318, 1.5) * 150;
  const left = [], right = [];
  for (let i = 0; i < centre.length; i++) {
    const [x, y] = centre[i];
    const [ax, ay] = centre[Math.max(0, i - 1)], [bx, by] = centre[Math.min(centre.length - 1, i + 1)];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = widthAt(y) / 2;
    left.push([x + nx * w, y + ny * w]); right.push([x - nx * w, y - ny * w]);
  }
  const smooth = (a) => { // through the points, Catmull-Rom as cubic Béziers
    let d = `M${f1(a[0][0])} ${f1(a[0][1])}`;
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(a.length - 1, i + 2)];
      d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  };
  // (the left edge up, then the right edge back down)
  const pathD = `${smooth(left)}L${f1(right[right.length - 1][0])} ${f1(right[right.length - 1][1])}${smooth(right.slice().reverse()).replace(/^M[^C]+/, "")}Z`;
  defs.push(`<linearGradient id="path" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${P.path}" stop-opacity="${P.pathOp}"/><stop offset=".7" stop-color="${P.path}" stop-opacity="${P.pathOp * 0.7}"/><stop offset="1" stop-color="${P.path}" stop-opacity=".15"/></linearGradient>`);
  layers.push(`<path d="${pathD}" fill="url(#path)"/>`);
  // the walked trail: a line of orange light from the bottom edge to his feet, as on the map
  const walked = smooth(centre.slice(0, 4));
  layers.push(`<path d="${walked}" stroke="#FF6B12" stroke-width="16" fill="none" stroke-linecap="round" opacity=".55" filter="url(#blur6)"/>
    <path d="${walked}" stroke="#FF6B12" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="${walked}" stroke="#FFD9BD" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"/>`);

  // tussock: clumps like fountains, a dark mound and blades with lighter tips, bigger near the bottom
  const tus = [];
  const clumps = [];
  for (let s = 0; s < 900 && clumps.length < 230; s++) {
    const y = 702 + Math.pow(r(), 0.62) * 318, x = r() * 1080 - 40;
    let dmin = 1e9; for (const [cx, cy] of centre) dmin = Math.min(dmin, Math.hypot(cx - x, (cy - y) * 1.4));
    if (dmin < widthAt(y) * 0.6 + 10) continue;
    const k = 0.3 + (y - 694) / 310 * 1.9;
    if (clumps.some(([qx, qy, qk]) => Math.hypot(qx - x, (qy - y) * 2.2) < 18 * (k + qk) / 2)) continue;
    clumps.push([x, y, k]);
  }
  clumps.sort((a, b) => a[1] - b[1]);
  for (const [x, y, k] of clumps) {
    const blades = 14 + Math.floor(r() * 10), h = (15 + r() * 11) * k, w = (13 + r() * 9) * k;
    tus.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w * 0.45)}" ry="${f1(h * 0.12 + 1)}" fill="#0A1220" opacity=".7"/>`);
    let dark = "", light = "";
    for (let b = 0; b < blades; b++) {
      const t = b / (blades - 1) - 0.5; const a = (-90 + t * 120 + (r() - 0.5) * 16) * Math.PI / 180;
      const len = h * (0.7 + r() * 0.45) * (1 - Math.abs(t) * 0.35);
      const tipx = x + Math.cos(a) * len * 0.9 + t * w * 0.3, tipy = y + Math.sin(a) * len;
      const cx = x + Math.cos(a) * len * 0.2, cy = y - len * 0.75;
      const seg = `M${f1(x + t * w * 0.25)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(tipx)} ${f1(tipy)}`;
      if (r() < 0.62) dark += seg; else light += seg;
    }
    const sw = (0.45 + k * 0.5).toFixed(2);
    tus.push(`<path d="${dark}" stroke="${P.tussock[3]}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity=".9"/>`);
    tus.push(`<path d="${light}" stroke="${P.tussock[Math.floor(r() * 3)]}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`);
  }
  layers.push(`<g>${tus.join("")}</g>`);

  // a second marker far ahead, where the trail meets the lake: the way goes on
  layers.push(`<path d="M634 684V712" stroke="#4A3B33" stroke-width="2.2"/><path d="M634 679L639.5 688.5H628.5Z" fill="#FF6B12" stroke="#FF6B12" stroke-width="1.2" stroke-linejoin="round"/><circle cx="634" cy="685" r="9" fill="#FF6B12" opacity=".25" filter="url(#soft)"/>`);

  // ---------------------------------------------------------------- the trail marker: an orange triangle on its post
  const post = { x: 716, base: 870, top: 500 };
  layers.push(`<g>
    <ellipse cx="${post.x + 6}" cy="${post.base + 2}" rx="26" ry="6" fill="#000" opacity=".35" filter="url(#soft)"/>
    <path d="M${post.x - 7} ${post.base}L${post.x - 6} ${post.top}L${post.x + 7} ${post.top - 2}L${post.x + 8} ${post.base}Z" fill="#4A3B33"/>
    <path d="M${post.x + 1} ${post.base}L${post.x + 1} ${post.top - 1}L${post.x + 7} ${post.top - 2}L${post.x + 8} ${post.base}Z" fill="#6E5A4C"/>
    <path d="M${post.x - 6} ${post.top + 40}h14M${post.x - 6} ${post.top + 112}h14" stroke="#2E241F" stroke-width="1.4" opacity=".6"/>
    <path d="M${post.x} ${post.top + 6}L${post.x + 27} ${post.top + 52}L${post.x - 27} ${post.top + 52}Z" fill="#FF6B12" opacity=".55" filter="url(#blur14)" transform="translate(0 1)"/>
    <path d="M${post.x} ${post.top + 8}L${post.x + 24} ${post.top + 50}L${post.x - 24} ${post.top + 50}Z" fill="#FF6B12" stroke="#FF6B12" stroke-width="4" stroke-linejoin="round"/>
    <path d="M${post.x} ${post.top + 15}L${post.x + 15} ${post.top + 42}" stroke="#FFC08F" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
  </g>`);

  // ---------------------------------------------------------------- Ewan, from behind (figure 200 high, feet at the bottom)
  layers.push(`<g transform="translate(${505 - 100} ${860 - 400}) scale(2)">${walker(P, variant)}</g>`);

  defs.push(`<radialGradient id="vig" cx="50%" cy="56%" r="72%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>`);
  layers.push(`<rect width="1000" height="1000" fill="url(#vig)"/>`);
  if (grain) {
    defs.push(`<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter>`);
    layers.push(`<rect width="1000" height="1000" filter="url(#grain)" opacity=".07" style="mix-blend-mode:overlay"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs>${defs.join("")}</defs>${layers.join("")}</svg>`;
}

// Ewan in a 100 x 200 box, seen from behind: beanie, rolled mat, orange pack with its lid, pocket and a turquoise
// bottle, hip belt, poles, one boot lifting
function walker(P, variant) {
  const jacket = "#1F2E4A", jacketLit = "#2E4468", pants = "#273650", boot = "#3B302B", sole = "#16120F";
  return `
  <ellipse cx="50" cy="199" rx="34" ry="5" fill="#000" opacity=".45" filter="url(#soft)"/>
  <!-- poles -->
  <path d="M14 104L4 196" stroke="#AEB9CB" stroke-width="2" stroke-linecap="round"/><path d="M87 100L97 189" stroke="#AEB9CB" stroke-width="2" stroke-linecap="round"/>
  <!-- legs -->
  <path d="M41 116L39 182" stroke="${pants}" stroke-width="13" stroke-linecap="round"/>
  <path d="M59 116L62 160L60 170" stroke="${pants}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M41 128L40 178" stroke="#33466A" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  <!-- boots: the left on the ground, the right lifting (its sole shows) -->
  <path d="M31 182C31 176 47 176 47 182L48 192C48 196 31 196 31 192Z" fill="${boot}"/><path d="M31 191h17v4c0 2-17 2-17 0Z" fill="${sole}"/>
  <path d="M52 166C52 162 68 162 68 166L69 176C69 179 52 179 52 176Z" fill="${boot}"/>
  <path d="M52.5 175h16v6c0 2-16 2-16 0Z" fill="${sole}"/><path d="M55 178h11M55 180.5h11" stroke="#3A322D" stroke-width="1"/>
  <!-- arms in the jacket, gloves on the poles -->
  <path d="M30 48C24 62 19 84 15 101" stroke="${jacket}" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M70 48C77 62 82 82 86 98" stroke="${jacket}" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M72 52C78 66 82 82 85 94" stroke="${jacketLit}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/>
  <circle cx="14.5" cy="103" r="4.6" fill="#141C2C"/><circle cx="86.5" cy="99" r="4.6" fill="#141C2C"/>
  <!-- head: hair at the back, a beanie with its fold and a pompom -->
  <ellipse cx="50" cy="19" rx="10.5" ry="12" fill="#3A2C26"/>
  <path d="M41.5 23C43 28 57 28 58.5 23" stroke="#2A1F1B" stroke-width="1.2" fill="none" opacity=".7"/>
  <path d="M39.4 16C39.4 3.6 60.6 3.6 60.6 16Z" fill="#2F4A70"/>
  <path d="M39 14.6h22v5.2c0 1-22 1-22 0Z" fill="#253B5C"/>
  <path d="M42 15v4M45 15v4.4M48 15v4.6M51 15v4.6M54 15v4.4M57 15v4" stroke="#1C2E4A" stroke-width=".9" opacity=".8"/>
  <circle cx="50" cy="3.6" r="3.6" fill="#D9E3F1"/>
  <path d="M55.5 6.5C58.5 8.5 60.2 11.5 60.4 14.4" stroke="${P.rim}" stroke-width="1.3" fill="none" opacity=".45"/>
  <!-- the pack -->
  <defs><linearGradient id="pack-${variant}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset=".55" stop-color="#FF6B12"/><stop offset="1" stop-color="#D9550A"/></linearGradient></defs>
  <path d="M27 50C27 42 33 38 40 38H60C67 38 73 42 73 50V112C73 118 69 121 63 121H37C31 121 27 118 27 112Z" fill="url(#pack-${variant})"/>
  <path d="M28 62C40 66 60 66 72 62" stroke="#B9480A" stroke-width="2" fill="none" opacity=".7"/>
  <path d="M34 74C34 71 36 70 39 70H61C64 70 66 71 66 74V104C66 107 64 109 61 109H39C36 109 34 107 34 104Z" fill="#EE6210" stroke="#C2500B" stroke-width="1.2"/>
  <path d="M38 75h24" stroke="#8A3A08" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M27 84h7M66 84h7M27 98h7M66 98h7" stroke="#2A2A33" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M71.5 48C73 58 73 96 71.5 110" stroke="#FFC79E" stroke-width="1.8" fill="none" opacity=".7"/>
  <!-- a turquoise bottle in the side pocket -->
  <rect x="71" y="80" width="7" height="28" rx="3" fill="#5CD6E6"/><rect x="72" y="76" width="5" height="5" rx="1.5" fill="#1F2E4A"/>
  <!-- hip belt -->
  <path d="M24 112C24 109 30 109 30 111V121C30 123 24 123 24 121Z" fill="#1B2436"/><path d="M70 111C70 109 76 109 76 112V121C76 123 70 123 70 121Z" fill="#1B2436"/>
  <path d="M30 115H70" stroke="#1B2436" stroke-width="5"/>
  <!-- the rolled mat on top -->
  <rect x="21" y="29" width="58" height="15" rx="7.5" fill="#C7D4E8"/>
  <path d="M21 36.5h58" stroke="#E6EEF9" stroke-width="2" opacity=".6"/>
  <ellipse cx="74" cy="36.5" rx="4.8" ry="7.2" fill="#DCE6F4"/><path d="M74 31.5C72 33 72 40 74 41.5" stroke="#9FB0CA" stroke-width="1" fill="none"/>
  <path d="M33 29v15M67 29v15" stroke="#1B2436" stroke-width="2.2"/>`;
}
