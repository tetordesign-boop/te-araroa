// « Mon carnet de route » : the South Island stage by stage, one phone-sized page per stage (distance, climb, high
// point, days, food to carry, where to sleep, what to know), a cover and an overview of the stretches with no shop.
// Built from the site's own data (trail, height profile, map points), printed to PDF by Chromium.
//   node scripts/guide/build.mjs            -> web/public/guide/carnet-de-route.pdf (+ the HTML next to it in /tmp)
import fs from "node:fs";
import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const W = ROOT + "web/";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const pois = read(W + "public/data/pois.json").pois;
const prof = read(W + "public/data/profile.json");
const trail = read(W + "src/data/trail-lite.json");
const coast = read(ROOT + "scripts/guide/south-island.json").ring;
const TOTAL = prof.total;

// ------------------------------------------------------------------ the trail's numbers
const elev = (km) => { const x = Math.max(0, Math.min(prof.e.length - 1, km / prof.step)), i = Math.floor(x), f = x - i; return prof.e[i] + ((prof.e[Math.min(i + 1, prof.e.length - 1)]) - prof.e[i]) * f; };
function climb(k0, k1) {
  let up = 0, down = 0, prev = elev(k0), max = prev, maxKm = k0, min = prev;
  for (let k = Math.ceil(k0 / prof.step) * prof.step; k <= k1 + 1e-9; k += prof.step) {
    const e = elev(k), d = e - prev; if (d > 0) up += d; else down -= d;
    if (e > max) { max = e; maxKm = k; } if (e < min) min = e; prev = e;
  }
  return { up, down, max, maxKm, min };
}
const rule = (km, up, down) => km / 4 + up / 600 + down / 1800; // hours: 4 km/h, 600 m of climb an hour

// ------------------------------------------------------------------ the stages (milestones of the site's map)
const st = Object.fromEntries(trail.places.map((p) => [p.n, p.km]));
const KM = (n) => { if (!(n in st)) throw new Error("no place " + n); return st[n]; };
// terrain: how much slower than the rule the ground is (river beds, mud, scree, exposed ridges = slower; roads = faster)
const STAGES = [
  { from: "Ship Cove · Meretoto", to: "Anakiwa", track: "Queen Charlotte Track", terrain: 1.05,
    notes: ["Bateau-taxi de Picton jusqu'à Ship Cove : réserve-le.", "Le Queen Charlotte Track traverse des terres privées : il faut le pass du sentier (QCTLC).", "Campings DOC et lodges tout du long ; certains campings se réservent."] },
  { from: "Anakiwa", to: "Havelock", track: "Route et piste cyclable", terrain: 0.9,
    notes: ["Une journée facile, en bonne partie sur route.", "Havelock : dernier vrai magasin avant St Arnaud. Fais le plein pour la chaîne de Richmond."] },
  { from: "Havelock", to: "Pelorus Bridge", track: "Vallée de la Pelorus", terrain: 1.0,
    notes: ["Route puis forêt jusqu'au pont de la Pelorus.", "Pelorus Bridge : camping et café, pas de supermarché."] },
  { from: "Pelorus Bridge", to: "St Arnaud", track: "Richmond Alpine Track", terrain: 1.25,
    notes: ["La section la plus sauvage et la plus lente du sentier : arêtes exposées autour du mont Rintoul, pierriers, peu d'eau sur les crêtes.", "Beaucoup de randonneurs y mettent 6 à 9 jours : pars avec de la marge.", "Pas de sortie facile : regarde la météo avant d'entrer."] },
  { from: "St Arnaud", to: "Waiau Pass", track: "Vallée de la Travers et Blue Lake", terrain: 1.25,
    notes: ["Travers Saddle (1 787 m), puis Blue Lake (Rotomairewhenua), l'eau douce la plus claire jamais mesurée : on n'y touche pas, le lac est tapu.", "Waiau Pass (1 870 m) est un vrai passage alpin : pas par mauvais temps, descente raide dans les éboulis."] },
  { from: "Waiau Pass", to: "Boyle Village", track: "Vallée de la Waiau et St James Walkway", terrain: 1.15,
    notes: ["Longue vallée de la Waiau, puis le St James Walkway.", "Boyle Village : pas de magasin. Envoie-toi un colis au centre de plein air, ou file en stop à Hanmer Springs."] },
  { from: "Boyle Village", to: "Arthur's Pass (Klondyke Corner)", short: "Arthur's Pass", track: "Harper Pass", terrain: 1.2,
    notes: ["Harper Pass (962 m) puis la vallée de la Taramakau : beaucoup de gués, infranchissables en crue.", "Arthur's Pass : petite épicerie chère, au village, à 4 ou 5 km du sentier."] },
  { from: "Arthur's Pass (Klondyke Corner)", to: "Lake Coleridge · Rakaia", short2: "Rakaia", track: "Goat Pass et rivière Deception", terrain: 1.25,
    notes: ["On remonte la Deception dans son lit : à éviter après de fortes pluies.", "La Rakaia ne se traverse pas à gué : transfert par la route, souvent via Methven pour se ravitailler."] },
  { from: "Lake Coleridge · Rakaia", to: "Rangitata", track: "Turtons et Clent Hills Saddle", terrain: 1.1,
    notes: ["Grands espaces de tussock, Clent Hills Saddle (1 485 m).", "La Rangitata ne se traverse pas à gué : transfert par la route, souvent via Geraldine."] },
  { from: "Rangitata", to: "Lake Tekapo", track: "Two Thumb Range", terrain: 1.15,
    notes: ["Stag Saddle : le point le plus haut de tout le Te Araroa.", "Lake Tekapo : Four Square."] },
  { from: "Lake Tekapo", to: "Twizel", track: "Les canaux du Mackenzie", terrain: 0.85,
    notes: ["Plat, sur les pistes des canaux, sans ombre : crème solaire, eau, vent de face possible.", "Twizel : Four Square et poste."] },
  { from: "Twizel", to: "Lake Ohau", track: "Plaine du Mackenzie", terrain: 0.85,
    notes: ["Courte étape de plaine jusqu'au lac Ohau."] },
  { from: "Lake Ohau", to: "Lake Hāwea", track: "Ahuriri et Breast Hill", terrain: 1.15,
    notes: ["La rivière Ahuriri : gué délicat, ne le tente pas en crue.", "Breast Hill, puis une longue descente vers le lac Hāwea. Lake Hāwea : FreshChoice."] },
  { from: "Lake Hāwea", to: "Wānaka", track: "Rivière Hāwea", terrain: 0.9,
    notes: ["Facile, le long de la rivière Hāwea puis du lac Wānaka.", "Wānaka : supermarché et magasin outdoor, bon endroit pour réparer le matériel."] },
  { from: "Wānaka", to: "Arrowtown", track: "Motatapu Track", terrain: 1.25,
    notes: ["Le Motatapu enchaîne des montées et descentes raides : les kilomètres comptent double.", "Arrowtown : Four Square."] },
  { from: "Arrowtown", to: "Queenstown", track: "Pistes cyclables", terrain: 0.9,
    notes: ["Facile. Frankton : PAK'nSAVE. Queenstown : tout.", "Ensuite le lac Wakatipu se traverse en bateau ou par la route."] },
  { from: "Queenstown", to: "Mavora Lakes", track: "Après le lac Wakatipu", terrain: 1.0,
    notes: ["Après le transfert du lac, de larges vallées jusqu'aux lacs Mavora.", "Pas de magasin avant Riverton : prévois Te Anau (en stop depuis la route de Te Anau) ou un colis."] },
  { from: "Mavora Lakes", to: "Birchwood", toKm: 1168.1, track: "Takitimu Track", terrain: 1.3,
    notes: ["Takitimu : forêt, boue et balisage parfois rare.", "Beaucoup font un aller-retour en stop à Te Anau quand le sentier croise la route."] },
  { from: "Birchwood", fromKm: 1168.1, to: "Riverton · Aparima", track: "Longwood Forest", terrain: 1.35,
    notes: ["Longwood Forest : boue profonde et navigation délicate, compte plus lent que prévu.", "Colac Bay puis Riverton : Foodcentre."] },
  { from: "Riverton · Aparima", to: "Invercargill", track: "Oreti Beach", terrain: 0.9,
    notes: ["La longue plage d'Oreti : sable dur, vent, marée à surveiller.", "Invercargill : grande ville, tout ce qu'il faut."] },
  { from: "Invercargill", to: "Bluff · Stirling Point", track: "Jusqu'au bout", terrain: 0.9,
    notes: ["Estuaire, route, puis le sentier côtier jusqu'au panneau de Stirling Point.", "Le dernier jour."] },
];
const clean = (n) => n.replace(/\s*\(.*\)$/, "");

// food: shops that sell food, near the trail (Arthur's Pass store is in the village, ~4.5 km off)
const FOOD = new Set(["super", "general", "conv"]);
const shops = pois.filter((p) => p.t === "shop" && FOOD.has(p.sub) && p.d <= 5000).sort((a, b) => a.km - b.km);
// merge shops of the same town (within 3 km): keep the biggest
const towns = [];
for (const s of shops) {
  const last = towns[towns.length - 1];
  const rank = { super: 3, general: 2, conv: 1 }[s.sub];
  if (last && s.km - last.km < 3) { if (rank > last.rank) Object.assign(last, { name: s.n, sub: s.sub, rank, d: s.d, town: s.town ?? last.town }); continue; }
  towns.push({ km: s.km, name: s.n, sub: s.sub, rank, d: s.d, town: s.town });
}
const SUB = { super: "supermarché", general: "épicerie", conv: "supérette" };
for (const t of towns) {
  const near = trail.places.filter((p) => Math.abs(p.km - t.km) < 6).sort((a, b) => Math.abs(a.km - t.km) - Math.abs(b.km - t.km))[0];
  t.place = t.town ? t.town.replace(/ National Park$/, "") : near ? clean(near.n).replace(/ · .*/, "") : t.name;
}
// the resupplies off the trail that most walkers use (the long stretches with no shop on the trail)
const OPTIONS = [
  { km: KM("Boyle Village"), place: "Boyle Village", how: "colis au centre de plein air, ou Hanmer Springs en stop", off: true },
  { km: KM("Lake Coleridge · Rakaia"), place: "Methven", how: "pendant le transfert de la Rakaia", off: true },
  { km: KM("Rangitata"), place: "Geraldine", how: "pendant le transfert de la Rangitata", off: true },
  { km: KM("Mavora Lakes"), place: "Te Anau", how: "en stop par la route de Te Anau", off: true },
];
const nodes = [...towns, ...OPTIONS].sort((a, b) => a.km - b.km);
const stageAt = (km) => STAGES.find((s) => km >= s.k0 - 1e-6 && km <= s.k1 + 1e-6) ?? STAGES[STAGES.length - 1];

for (const s of STAGES) {
  s.k0 = s.fromKm ?? KM(s.from); s.k1 = s.toKm ?? KM(s.to);
  s.km = s.k1 - s.k0; Object.assign(s, climb(s.k0, s.k1));
  s.hours = rule(s.km, s.up, s.down) * s.terrain;
}
/** walking hours between two km, with each stage's terrain */
function hoursBetween(a, b) {
  let h = 0;
  for (const s of STAGES) { const x = Math.max(a, s.k0), y = Math.min(b, s.k1); if (y > x) { const c = climb(x, y); h += rule(y - x, c.up, c.down) * s.terrain; } }
  return h;
}
const DAY = 8; // walking hours in a day, for the food
for (const s of STAGES) {
  s.startShop = s.k0 === 0 ? { place: "Picton", how: "fais le plein avant le bateau", off: true } : (nodes.filter((t) => Math.abs(t.km - s.k0) <= 5).sort((a, b) => Math.abs(a.km - s.k0) - Math.abs(b.km - s.k0))[0] ?? null);
  s.nextNode = nodes.find((t) => t.km > s.k0 + 5) ?? null;
  s.nextShop = towns.find((t) => t.km > s.k0 + 5) ?? null;
  s.toNodeKm = s.nextNode ? s.nextNode.km - s.k0 : null;
  s.foodDays = s.nextNode ? Math.max(1, Math.ceil(hoursBetween(s.k0, s.nextNode.km) / DAY - 0.15)) : null;
  s.huts = pois.filter((p) => p.t === "hut" && p.km > s.k0 + 0.2 && p.km <= s.k1 + 0.2 && p.d <= 1000).sort((a, b) => a.km - b.km);
  s.camps = pois.filter((p) => p.t === "camp" && p.km > s.k0 + 0.2 && p.km <= s.k1 + 0.2 && p.d <= 600 && !/information|board/i.test(p.n)).sort((a, b) => a.km - b.km);
  s.passes = pois.filter((p) => p.t === "pass" && p.km > s.k0 && p.km < s.k1 && p.d <= 60).map((p) => ({ km: p.km, n: p.n.replace(/^Noti Taramakau \/ /, "").replace(/^Poukirikiri \/ /, ""), e: p.e ?? Math.round(elev(p.km)) }));
}
// named high points the map does not have as passes
const extraPass = (km, n, e) => { const s = stageAt(km); if (!s.passes.some((p) => Math.abs(p.km - km) < 2)) s.passes.push({ km, n, e: e ?? Math.round(elev(km)), official: !!e }); };
extraPass(KM("Waiau Pass") - 0.01, "Waiau Pass", 1870);
{ let i = 0; prof.e.forEach((e, j) => { if (e > prof.e[i]) i = j; }); extraPass(i * prof.step, "Stag Saddle", 1925); }
// the high point of a stage: the official height when it is a named pass
for (const s of STAGES) { const p = s.passes.find((q) => q.official && Math.abs(q.km - s.maxKm) < 3); if (p) { s.maxShown = p.e; s.maxName = p.n; } }

// food gaps along the whole trail (from shop to shop; Picton before Ship Cove counts as the first)
const gaps = []; { let prev = { km: 0, place: "Picton" }; for (const t of nodes) { if (t.km - prev.km < 0.5) continue; gaps.push({ a: prev.km, b: t.km, an: prev.place, bn: t.place, off: !!t.off, days: Math.max(1, Math.ceil(hoursBetween(prev.km, t.km) / DAY - 0.15)) }); prev = t; } }

// ------------------------------------------------------------------ formatting
const nf = (n, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, " ");
const m = (n) => `${nf(Math.round(n / 10) * 10)} m`;
const kmS = (n) => (n < 10 ? nf(n, 1) : nf(n, 0));
function daysText(h) {
  if (h < 9.5) return { big: `${nf(Math.round(h * 2) / 2, h % 1 ? 1 : 0).replace(",0", "")} h`, small: "Une journée de marche" };
  const lo = Math.max(1, Math.round(h / 9)), hi = Math.max(lo, Math.round(h / 7));
  return { big: lo === hi ? `${lo} j` : `${lo}–${hi} j`, small: `≈ ${nf(Math.round(h))} h de marche` };
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ------------------------------------------------------------------ drawings
const C = { night: "#0C1526", card: "#142036", ink: "#F3F6FB", ink2: "#B4C0D4", ink3: "#8292AD", line: "rgba(150,180,228,.14)", marker: "#FF6B12", glacier: "#5CD6E6", hut: "#8B80FF", camp: "#56E39F", pass: "#FF3D9A", food: "#B5E853" };

function profileSvg(s, Wd = 358, H = 168) {
  const T = 30, B = 22, pad = (s.max - s.min) < 400 ? (400 - (s.max - s.min)) / 2 : 40;
  const lo = s.min - pad, hi = s.max + pad + 30;
  const x = (k) => ((k - s.k0) / (s.k1 - s.k0)) * Wd, y = (e) => T + (1 - (e - lo) / (hi - lo)) * (H - T - B);
  const pts = []; for (let k = s.k0; k <= s.k1 + 1e-9; k += Math.max(prof.step, (s.k1 - s.k0) / 400)) pts.push([k, elev(k)]);
  pts.push([s.k1, elev(s.k1)]);
  const line = pts.map(([k, e], i) => `${i ? "L" : "M"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join("");
  const step = s.km > 150 ? 50 : s.km > 60 ? 20 : s.km > 25 ? 10 : 5;
  const ticks = []; for (let k = step; k < s.km - step * 0.4; k += step) ticks.push(k);
  const dots = [
    ...s.camps.map((p) => `<circle cx="${x(p.km).toFixed(1)}" cy="${(H - B + 7).toFixed(1)}" r="2.6" fill="${C.camp}"/>`),
    ...s.huts.map((p) => `<circle cx="${x(p.km).toFixed(1)}" cy="${y(elev(p.km)).toFixed(1)}" r="3.4" fill="${C.hut}" stroke="${C.night}" stroke-width="1.4"/>`),
    ...towns.filter((t) => t.km >= s.k0 - 0.5 && t.km <= s.k1 + 0.5).map((t) => `<rect x="${(x(Math.min(s.k1, Math.max(s.k0, t.km))) - 4).toFixed(1)}" y="${(y(elev(t.km)) - 4).toFixed(1)}" width="8" height="8" rx="2" fill="${C.food}" stroke="${C.night}" stroke-width="1.4"/>`),
  ];
  // label the high point, and passes that are well apart from it
  const labels = [];
  const hiX = x(s.maxKm), hiY = y(s.max);
  const named = s.passes.filter((p) => Math.abs(p.km - s.maxKm) < Math.max(1.5, s.km * 0.02))[0];
  const anchor = (px) => (px < 50 ? "start" : px > Wd - 50 ? "end" : "middle");
  labels.push(`<text x="${hiX.toFixed(1)}" y="${(hiY - 11).toFixed(1)}" text-anchor="${anchor(hiX)}" class="pl">${named ? esc(named.n) + " · " : ""}${s.maxShown ? `${nf(s.maxShown)}\u2009m` : m(s.max)}</text>`);
  const passMarks = s.passes.map((p) => { const px = x(p.km), py = y(elev(p.km)); return `<path d="M${px.toFixed(1)},${(py - 7).toFixed(1)}l4.5,7h-9z" fill="${C.pass}"/>`; });
  return `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" class="prof">
    <defs><linearGradient id="g${s.n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.glacier}" stop-opacity=".34"/><stop offset="1" stop-color="${C.glacier}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((k) => `<line x1="${x(s.k0 + k)}" x2="${x(s.k0 + k)}" y1="${T - 8}" y2="${H - B}" stroke="${C.line}"/>`).join("")}
    <path d="${line}L${Wd},${H - B}L0,${H - B}Z" fill="url(#g${s.n})"/>
    <path d="${line}" fill="none" stroke="${C.glacier}" stroke-width="2.2" stroke-linejoin="round"/>
    ${passMarks.join("")}${dots.join("")}
    <circle cx="${hiX.toFixed(1)}" cy="${hiY.toFixed(1)}" r="3" fill="${C.ink}"/>
    ${labels.join("")}
    <text x="0" y="${H - 5}" class="ax">0</text>
    ${ticks.map((k) => `<text x="${x(s.k0 + k)}" y="${H - 5}" text-anchor="middle" class="ax">${k}</text>`).join("")}
    <text x="${Wd}" y="${H - 5}" text-anchor="end" class="ax">${kmS(s.km)} km</text>
  </svg>`;
}

function overviewSvg(Wd = 358, H = 118) {
  const T = 16, B = 18, lo = 0, hi = 2100;
  const x = (k) => (k / TOTAL) * Wd, y = (e) => T + (1 - (e - lo) / (hi - lo)) * (H - T - B);
  const pts = []; for (let k = 0; k <= TOTAL; k += 1) pts.push([k, elev(k)]);
  const line = pts.map(([k, e], i) => `${i ? "L" : "M"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join("");
  return `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}">
    <defs><linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.glacier}" stop-opacity=".3"/><stop offset="1" stop-color="${C.glacier}" stop-opacity="0"/></linearGradient></defs>
    ${STAGES.map((s) => `<line x1="${x(s.k0)}" x2="${x(s.k0)}" y1="${T}" y2="${H - B}" stroke="${C.line}"/>`).join("")}
    <path d="${line}L${Wd},${H - B}L0,${H - B}Z" fill="url(#go)"/><path d="${line}" fill="none" stroke="${C.glacier}" stroke-width="1.4"/>
    ${STAGES.filter((s) => x(s.k1) - x(s.k0) >= 11).map((s) => `<text x="${(x(s.k0) + x(s.k1)) / 2}" y="${H - 5}" text-anchor="middle" class="ax ax--n">${s.n}</text>`).join("")}
  </svg>`;
}

function gapsSvg(Wd = 358) {
  const x = (k) => (k / TOTAL) * Wd;
  const col = (d) => (d >= 7 ? C.marker : d >= 4 ? "#FFB547" : C.glacier);
  const rows = gaps.map((g, i) => `<rect x="${x(g.a) + 1}" y="10" width="${Math.max(1.5, x(g.b) - x(g.a) - 2)}" height="12" rx="3" fill="${col(g.days)}" fill-opacity="${g.days >= 4 ? 1 : 0.55}"/>`).join("");
  const labels = gaps.filter((g) => g.b - g.a >= 100).map((g) => `<text x="${(x(g.a) + x(g.b)) / 2}" y="38" text-anchor="middle" class="gl">${nf(Math.round(g.b - g.a))} km</text><text x="${(x(g.a) + x(g.b)) / 2}" y="51" text-anchor="middle" class="gl gl--d">${g.days} j</text>`).join("");
  return `<svg viewBox="0 0 ${Wd} 58" width="${Wd}" height="58">${nodes.map((t) => t.off ? `<rect x="${x(t.km) - 2.6}" y="3.4" width="5.2" height="5.2" rx="1.5" fill="none" stroke="${C.food}" stroke-width="1.3"/>` : `<rect x="${x(t.km) - 3}" y="3" width="6" height="6" rx="1.5" fill="${C.food}"/>`).join("")}${rows}${labels}</svg>`;
}

function coverSvg(Wd = 358, H = 470) {
  const lat0 = -43.8, kx = Math.cos((lat0 * Math.PI) / 180);
  const all = coast; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [a, b] of all) { x0 = Math.min(x0, a * kx); x1 = Math.max(x1, a * kx); y0 = Math.min(y0, -b); y1 = Math.max(y1, -b); }
  const sc = Math.min(Wd / (x1 - x0), H / (y1 - y0)) * 0.98, ox = (Wd - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const P = ([a, b]) => [ox + (a * kx - x0) * sc, oy + (-b - y0) * sc];
  const land = all.map((p, i) => `${i ? "L" : "M"}${P(p).map((v) => v.toFixed(1)).join(",")}`).join("") + "Z";
  const tr = trail.parts.map((part) => part.map((p, i) => `${i ? "L" : "M"}${P(p).map((v) => v.toFixed(1)).join(",")}`).join("")).join("");
  const at = (km) => { for (const part of trail.parts) for (let i = 1; i < part.length; i++) if (part[i][2] >= km) return P(part[i]); return P(trail.parts.at(-1).at(-1)); };
  const dots = STAGES.map((s) => { const [cx, cy] = at(s.k0); return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.6" fill="${C.night}" stroke="${C.ink}" stroke-width="1.3"/>`; }).join("");
  const [sx, sy] = at(0), [ex, ey] = at(TOTAL);
  return `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}">
    <path d="${land}" fill="#16233D" stroke="rgba(150,180,228,.22)" stroke-width="1"/>
    <path d="${tr}" fill="none" stroke="${C.marker}" stroke-width="5" stroke-opacity=".18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${tr}" fill="none" stroke="${C.marker}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    <circle cx="${sx}" cy="${sy}" r="5" fill="${C.marker}"/><text x="${sx - 9}" y="${sy + 4}" text-anchor="end" class="cl">Ship Cove</text>
    <circle cx="${ex}" cy="${ey}" r="5" fill="${C.marker}"/><text x="${ex + 9}" y="${ey + 4}" class="cl">Bluff</text>
  </svg>`;
}

// ------------------------------------------------------------------ pages
STAGES.forEach((s, i) => { s.n = i + 1; });
const tot = { up: climb(0, TOTAL).up, hours: STAGES.reduce((a, s) => a + s.hours, 0) };
const nb = (t) => esc(t).replace(/ /g, "\u00a0");
const fmtStage = (s) => `${nb(clean(s.from).replace(/ · .*/, ""))} → ${nb(clean(s.to).replace(/ · .*/, ""))}`;

function stagePage(s) {
  const d = daysText(s.hours);
  const where = (n) => n.off ? `<b>${esc(n.place)}</b>, ${esc(n.how)}` : `<b>${esc(n.place)}</b>, ${esc(n.name)} (${SUB[n.sub]}${n.d > 1500 ? `, à ${nf(n.d / 1000, 1)} km du sentier` : ""})`;
  const start = s.startShop ? `Au départ : ${where(s.startShop)}.` : "Aucun magasin au départ.";
  const next = s.nextNode ? `Prochain ravitaillement : ${where(s.nextNode)}, dans <b>${nf(Math.round(s.toNodeKm))} km</b>.` : "";
  const shopLine = s.nextNode?.off && s.nextShop ? `Sur le sentier, le prochain magasin est à ${esc(s.nextShop.place)}, dans ${nf(Math.round(s.nextShop.km - s.k0))} km.` : "";
  const sleeps = [...s.huts.map((p) => ({ ...p, k: "hut" })), ...s.camps.map((p) => ({ ...p, k: "camp" }))].sort((a, b) => a.km - b.km);
  const shown = sleeps.slice(0, 12);
  return `<section class="page stage">
    <header class="st-top"><span class="st-n">Étape ${s.n}<span>/${STAGES.length}</span></span><span class="st-km">km ${nf(Math.round(s.k0))} → ${nf(Math.round(s.k1))}</span></header>
    <h2 class="st-title">${fmtStage(s)}</h2>
    <p class="st-track">${esc(s.track)}</p>
    <div class="st-stats">
      <div><span class="k">Distance</span><span class="v">${kmS(s.km)}<small>km</small></span></div>
      <div><span class="k">Montée</span><span class="v">${nf(Math.round(s.up / 10) * 10)}<small>m</small></span></div>
      <div><span class="k">Descente</span><span class="v">${nf(Math.round(s.down / 10) * 10)}<small>m</small></span></div>
      <div><span class="k">Durée</span><span class="v">${d.big}</span></div>
    </div>
    <p class="st-hours">${d.small} · point haut ${s.maxShown ? `${nf(s.maxShown)}\u2009m` : m(s.max)} · ${nf(Math.round(s.up / s.km))} m de montée par km</p>
    ${profileSvg(s)}
    <div class="food ${s.foodDays >= 7 ? "food--long" : s.foodDays >= 4 ? "food--mid" : ""}">
      <div class="food__days"><span class="v">${s.foodDays ?? "–"}</span><span class="k">jour${(s.foodDays ?? 0) > 1 ? "s" : ""} de nourriture</span></div>
      <div class="food__txt"><p>${start}</p>${next ? `<p>${next}</p>` : `<p>Plus besoin de ravitailler avant l'arrivée.</p>`}${shopLine ? `<p class="food__alt">${shopLine}</p>` : ""}</div>
    </div>
    <h3 class="h3">Où dormir <span>${s.huts.length} refuge${s.huts.length > 1 ? "s" : ""} · ${s.camps.length} camping${s.camps.length > 1 ? "s" : ""}</span></h3>
    <ul class="sleep">${shown.map((p) => `<li><i class="dot dot--${p.k}"></i><span class="sk">+${kmS(p.km - s.k0)}</span><span class="sn">${esc(p.n.replace(/ DoC| DOC/g, ""))}</span>${p.cap ? `<span class="sc">${p.cap}</span>` : ""}</li>`).join("")}${sleeps.length > shown.length ? `<li class="more">et ${sleeps.length - shown.length} autres sur le profil</li>` : ""}${!sleeps.length ? `<li class="more">Pas de refuge ni de camping connu : ville, lodge ou camping libre.</li>` : ""}</ul>
    <h3 class="h3">À savoir</h3>
    <ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
    <footer class="pf"><span>Carnet de route · Te Araroa, île du Sud</span><span>${s.n + 2}</span></footer>
  </section>`;
}

const cover = `<section class="page cover">
  <p class="cv-kicker">Te Araroa · île du Sud</p>
  <h1 class="cv-title">Mon carnet<br>de route</h1>
  ${coverSvg()}
  <div class="cv-stats">
    <div><span class="v">${nf(Math.round(TOTAL))}</span><span class="k">km</span></div>
    <div><span class="v">${nf(Math.round(tot.up / 100) * 100)}</span><span class="k">m de montée</span></div>
    <div><span class="v">${STAGES.length}</span><span class="k">étapes</span></div>
    <div><span class="v">${Math.round(tot.hours / DAY)}</span><span class="k">jours de marche</span></div>
  </div>
  <p class="cv-note">Une page par étape : la distance, le dénivelé, le temps, la nourriture à porter, où dormir et ce qu'il faut savoir. Les temps suivent une règle simple (4 km/h et 600 m de montée par heure, corrigés selon le terrain) : ton vrai rythme dira le reste. Vérifie toujours les notes officielles et la météo.</p>
</section>`;

const overview = `<section class="page overview">
  <h2 class="ov-title">Le sentier en un coup d'œil</h2>
  <p class="ov-sub">Le profil complet, étape par étape, et les portions sans magasin.</p>
  ${overviewSvg()}
  <h3 class="h3">Jours de nourriture à porter <span>■ magasin · □ hors sentier</span></h3>
  ${gapsSvg()}
  <p class="ov-legend"><i style="background:${C.glacier};opacity:.55"></i>moins de 4 jours <i style="background:#FFB547"></i>4 à 6 jours <i style="background:${C.marker}"></i>7 jours et plus</p>
  <p class="ov-note">Les carrés vides sont des ravitaillements hors du sentier : colis à Boyle ou Hanmer Springs, Methven, Geraldine, Te Anau.</p>
  <table class="ov-table">
    <tbody>${STAGES.map((s) => { const d = daysText(s.hours); return `<tr><td class="n">${s.n}</td><td class="t">${fmtStage(s)}</td><td class="r">${kmS(s.km)}</td><td class="r">+${nf(Math.round(s.up / 100) * 100)}</td><td class="r d">${d.big}</td><td class="f">${s.startShop ? "●" : ""}</td></tr>`; }).join("")}</tbody>
  </table>
  <p class="ov-legend ov-legend--t">km · montée en m · durée · ● magasin au départ</p>
  <footer class="pf"><span>Carnet de route · Te Araroa, île du Sud</span><span>2</span></footer>
</section>`;

const fontDir = W + "node_modules/@fontsource-variable/";
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: url(file://${fontDir}archivo/files/archivo-latin-wdth-normal.woff2) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: Literata; src: url(file://${fontDir}literata/files/literata-latin-wght-normal.woff2) format("woff2"); font-weight: 200 900; }
@page { size: 390px 844px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: ${C.night}; color: ${C.ink}; font-family: Archivo, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 390px; height: 844px; padding: 26px 16px 0; position: relative; overflow: hidden; break-after: page; background: radial-gradient(120% 60% at 100% 0%, rgba(92,214,230,.07), transparent 60%), ${C.night}; }
.pf { position: absolute; left: 16px; right: 16px; bottom: 14px; display: flex; justify-content: space-between; font-size: 9.5px; color: ${C.ink3}; }
small { font-size: .45em; font-weight: 600; margin-left: 2px; letter-spacing: 0; color: ${C.ink2}; }
.h3 { margin: 16px 0 7px; font-size: 13px; font-weight: 720; display: flex; justify-content: space-between; align-items: baseline; }
.h3 span { font-size: 11px; font-weight: 500; color: ${C.ink3}; }
/* cover */
.cover { padding-top: 34px; }
.cv-kicker { margin: 0; font-size: 12px; color: ${C.glacier}; font-weight: 650; }
.cv-title { margin: 6px 0 4px; font-size: 46px; line-height: .98; font-weight: 840; font-stretch: 122%; letter-spacing: -0.035em; }
.cover svg { display: block; margin: 4px auto 0; }
.cl { fill: ${C.ink}; font-size: 11px; font-weight: 650; }
.cv-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.cv-stats div { display: flex; flex-direction: column; }
.cv-stats .v { white-space: nowrap; font-size: 25px; font-weight: 820; font-stretch: 112%; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.cv-stats .k { font-size: 10.5px; color: ${C.ink2}; }
.cv-note { margin: 14px 0 0; font-family: Literata, serif; font-size: 11.5px; line-height: 1.5; color: ${C.ink2}; }
/* overview */
.ov-title { margin: 0; font-size: 26px; line-height: 1.05; font-weight: 820; font-stretch: 116%; letter-spacing: -0.025em; }
.ov-sub { margin: 6px 0 10px; font-size: 12px; color: ${C.ink2}; }
.ax { fill: ${C.ink3}; font-size: 9px; } .ax--n { font-size: 8px; }
.gl { fill: ${C.ink}; font-size: 9px; font-weight: 650; } .gl--d { fill: ${C.ink2}; font-weight: 500; }
.ov-legend { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin: 4px 0 0; font-size: 9.5px; color: ${C.ink3}; }
.ov-legend i { display: inline-block; width: 10px; height: 7px; border-radius: 2px; margin-left: 6px; } .ov-legend i:first-child { margin-left: 0; }
.ov-note { margin: 6px 0 4px; font-family: Literata, serif; font-size: 10.5px; line-height: 1.45; color: ${C.ink2}; }
.ov-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; font-variant-numeric: tabular-nums; }
.ov-table td { padding: 2.9px 0; border-bottom: 1px solid ${C.line}; white-space: nowrap; }
.ov-table .n { color: ${C.ink3}; width: 18px; } .ov-table .t { max-width: 190px; overflow: hidden; text-overflow: ellipsis; font-weight: 560; }
.ov-table .r { text-align: right; padding-left: 7px; color: ${C.ink2}; } .ov-table .d { color: ${C.ink}; font-weight: 650; }
.ov-table .f { text-align: right; width: 14px; color: ${C.food}; font-size: 9px; }
.ov-legend--t { justify-content: flex-end; }
/* stage */
.st-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 11.5px; }
.st-n { color: ${C.glacier}; font-weight: 700; } .st-n span { color: ${C.ink3}; font-weight: 500; }
.st-km { color: ${C.ink3}; font-variant-numeric: tabular-nums; }
.st-title { margin: 6px 0 0; font-size: 27px; line-height: 1.04; font-weight: 820; font-stretch: 114%; letter-spacing: -0.025em; }
.st-track { margin: 4px 0 0; font-family: Literata, serif; font-style: italic; font-size: 12.5px; color: ${C.ink2}; }
.st-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 12px; }
.st-stats div { background: ${C.card}; border-radius: 11px; padding: 7px 8px 8px; display: flex; flex-direction: column; box-shadow: inset 0 0 0 1px ${C.line}; }
.st-stats .k { font-size: 9.5px; color: ${C.ink3}; }
.st-stats .v { font-size: 21px; line-height: 1.05; font-weight: 800; font-stretch: 108%; letter-spacing: -0.03em; margin-top: 2px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.st-hours { margin: 7px 2px 2px; font-size: 10.5px; color: ${C.ink2}; }
.prof { display: block; margin-top: 4px; }
.pl { fill: ${C.ink}; font-size: 10px; font-weight: 650; }
.food { display: flex; gap: 12px; align-items: center; margin-top: 8px; padding: 11px 12px; border-radius: 14px; background: ${C.card}; box-shadow: inset 0 0 0 1px ${C.line}; }
.food__days { display: flex; flex-direction: column; align-items: center; min-width: 68px; }
.food__days .v { font-size: 38px; line-height: 1; font-weight: 840; font-stretch: 116%; letter-spacing: -0.04em; color: ${C.glacier}; }
.food__days .k { font-size: 9.5px; color: ${C.ink2}; text-align: center; line-height: 1.2; margin-top: 3px; }
.food--mid .food__days .v { color: #FFB547; } .food--long { box-shadow: inset 0 0 0 1px rgba(255,107,18,.45); } .food--long .food__days .v { color: ${C.marker}; }
.food__alt { color: ${C.ink3} !important; }
.food__txt p { margin: 0; font-size: 11.5px; line-height: 1.4; color: ${C.ink2}; } .food__txt p + p { margin-top: 3px; } .food__txt b { color: ${C.ink}; font-weight: 650; }
.sleep { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 12px; font-size: 10.5px; }
.sleep li { display: flex; align-items: baseline; gap: 5px; padding: 2.4px 0; break-inside: avoid; }
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; transform: translateY(-1px); } .dot--hut { background: ${C.hut}; } .dot--camp { background: ${C.camp}; }
.sk { flex: none; color: ${C.ink3}; font-variant-numeric: tabular-nums; min-width: 28px; }
.sn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sc { flex: none; color: ${C.ink3}; font-size: 9px; }
.sleep .more { color: ${C.ink3}; font-style: italic; column-span: all; }
.notes { margin: 0; padding: 0 0 0 14px; font-family: Literata, serif; font-size: 11.8px; line-height: 1.48; color: ${C.ink}; }
.notes li { margin: 0 0 5px; } .notes li::marker { color: ${C.marker}; }
</style></head><body>${cover}${overview}${STAGES.map(stagePage).join("")}</body></html>`;

fs.writeFileSync("/tmp/carnet.html", html);
const out = W + "public/guide/carnet-de-route.pdf";
fs.mkdirSync(W + "public/guide", { recursive: true });
const b = await chromium.launch(); const pg = await b.newPage();
await pg.goto("file:///tmp/carnet.html"); await pg.evaluate(() => document.fonts.ready);
await pg.pdf({ path: out, width: "390px", height: "844px", printBackground: true, preferCSSPageSize: true });
// overflow check: no page content may run past its height
const over = await pg.evaluate(() => [...document.querySelectorAll(".page")].map((p, i) => { const last = [...p.children].filter((c) => !c.classList.contains("pf")).at(-1); return last && last.getBoundingClientRect().bottom - p.getBoundingClientRect().top > 816 ? i + 1 : null; }).filter(Boolean));
await b.close();
console.log("pdf:", out, (fs.statSync(out).size / 1024).toFixed(0) + " KB", over.length ? "OVERFLOW pages " + over.join(",") : "no overflow");
console.log(STAGES.map((s) => `${s.n} ${clean(s.from)}→${clean(s.to)} ${s.km.toFixed(0)} km +${Math.round(s.up)} ${daysText(s.hours).big} food ${s.foodDays}`).join("\n"));
console.log("gaps:", gaps.map((g) => `${g.an}→${g.bn} ${Math.round(g.b - g.a)}km ${g.days}j`).join(" | "));
