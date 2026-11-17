// Points of interest along the trail, from OpenStreetMap (© OpenStreetMap contributors, ODbL):
// huts, campsites, water points, resupply (food shops, outdoor shops, post offices, DOC and i-SITE centres),
// passes, peaks, waterfalls, viewpoints, and the places chosen by hand in
// curated.mjs (iconic spots, film locations), located on the map too. Each one gets its km on the trail and
// its distance from it, so the site can say "km 412, 1.2 km off the trail".
// Usage: node scripts/data/pois.mjs <out.json> [trail.json path or URL]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { CURATED } from "./curated.mjs";
import { bboxOf, loadTrail, makeLocator, sleep, UA } from "./lib.mjs";

const [, , out = "web/public/data/pois.json", trailSrc] = process.argv;
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`${url} ${res.status} ${(await res.text()).slice(0, 200)}`);
      return (await res.json()).elements;
    } catch (e) {
      lastErr = e;
      console.warn("overpass retry:", e.message);
      await sleep(5000 * (attempt + 1));
    }
  }
  throw lastErr;
}

const trail = await loadTrail(trailSrc);
const locate = makeLocator(trail);
const [w, s, e, n] = bboxOf(trail, 0.2);
const bb = `${s},${w},${n},${e}`;

const general = await overpass(`[out:json][timeout:240][bbox:${bb}];
(
  nwr["tourism"~"^(alpine_hut|wilderness_hut|camp_site|viewpoint)$"];
  nwr["amenity"="shelter"]["name"~"(Hut|Biv|Bivvy|Bivouac)",i];
  node["natural"="saddle"]["name"];
  node["mountain_pass"="yes"]["name"];
  nwr["waterway"="waterfall"]["name"];
  nwr["natural"="waterfall"]["name"];
);
out center tags;`);
await sleep(3000);
const peaks = await overpass(`[out:json][timeout:240][bbox:${bb}];
node["natural"~"^(peak|volcano)$"]["name"];
out body;`);
await sleep(3000);
const water = await overpass(`[out:json][timeout:240][bbox:${bb}];
(
  node["amenity"~"^(drinking_water|water_point)$"];
  node["man_made"="water_tap"];
  node["natural"="spring"];
);
out body;`);
await sleep(3000);
const shops = await overpass(`[out:json][timeout:240][bbox:${bb}];
(
  nwr["shop"~"^(supermarket|convenience|general|outdoor)$"];
  nwr["amenity"="post_office"];
  nwr["tourism"="information"]["information"="office"];
);
out center tags;`);
await sleep(3000);
// the places chosen by hand, looked up by name a little wider (film locations can be a few km off)
const [cw, cs, ce, cn] = bboxOf(trail, 0.35);
// (exact names only: a regular expression over every named thing on the island is too slow for Overpass)
const names = [...new Set(CURATED.flatMap((c) => c.find?.names ?? []))];
const finds = names.map((x) => `nwr["name"="${x.replace(/"/g, '\\"')}"];`).join("\n  ");
const curatedEls = await overpass(`[out:json][timeout:240][bbox:${cs},${cw},${cn},${ce}];
(
  ${finds}
);
out center tags;`);
console.log(`overpass: ${general.length} general, ${peaks.length} peaks, ${water.length} water, ${shops.length} shops, ${curatedEls.length} curated candidates`);

const num = (v) => {
  if (v === undefined || v === null) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(v));
  return m ? Math.round(parseFloat(m[0].replace(",", "."))) : null;
};
const clean = (s) => (s ? String(s).replace(/\s+/g, " ").trim() : null);

function kind(t) {
  // campsites sometimes carry a hut tag: the name tells the truth
  if ((t.tourism === "alpine_hut" || t.tourism === "wilderness_hut" || t.amenity === "shelter") && /camp(site|ground)?\b/i.test(t.name ?? "") && !/hut\b/i.test(t.name ?? "")) return "camp";
  if (t.tourism === "alpine_hut" || t.tourism === "wilderness_hut" || t.amenity === "shelter") return "hut";
  if (t.tourism === "camp_site") return "camp";
  if (t.tourism === "viewpoint") return "view";
  if (t.natural === "saddle" || t.mountain_pass === "yes") return "pass";
  if (t.waterway === "waterfall" || t.natural === "waterfall") return "fall";
  if (t.amenity === "drinking_water" || t.amenity === "water_point" || t.man_made === "water_tap" || t.natural === "spring") return "water";
  if (t.natural === "peak" || t.natural === "volcano") return "peak";
  if (shopKind(t)) return "shop";
  return null;
}
/** what kind of resupply: food (supermarket, general store, convenience store), outdoor gear, a post office (where
 * hikers send themselves food parcels), or a DOC or i-SITE visitor centre (hut tickets, weather, track news) */
function shopKind(t) {
  if (t.shop === "supermarket") return "super";
  if (t.shop === "general") return "general";
  if (t.shop === "convenience") return "conv";
  if (t.shop === "outdoor") return "gear";
  if (t.amenity === "post_office") return "post";
  if (t.tourism === "information" && t.information === "office" && /\bDOC\b|conservation|i-?SITE|visitor/i.test(`${t.name ?? ""} ${t.operator ?? ""}`)) return "info";
  return null;
}
const SHOP_RANK = { super: 0, general: 1, conv: 2 };

// how far from the trail each kind is still worth showing (metres)
function keep(k, d, ele, named) {
  switch (k) {
    case "hut": return d <= 2500;
    case "camp": return d <= 1500;
    case "pass": return d <= 2000;
    case "view": return named && d <= 1200;
    case "fall": return d <= 2000;
    case "water": return d <= 300;
    case "shop": return d <= 1500;
    case "peak": return d <= 3000 || (ele !== null && ele >= 1800 && d <= 8000) || (ele !== null && ele >= 2800 && d <= 16000);
    default: return false;
  }
}

const items = [];
for (const el of [...general, ...peaks, ...water, ...shops]) {
  const t = el.tags ?? {};
  const k = kind(t);
  if (!k) continue;
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) continue;
  const name = clean(t.name) ?? (k === "shop" ? clean(t.brand) : null);
  const ele = num(t.ele);
  const { km, d } = locate([lon, lat]);
  if (!keep(k, d, ele, !!name)) continue;
  // a tap or a spring needs no name (the site calls it by its kind)
  if (!name && k !== "water") continue;
  if (k === "water" && t.natural === "spring" && d > 250) continue;
  // a bike wash, a hot pool or a sulphur spring is no water to drink
  if (k === "water" && (t.drinking_water === "no" || /bike|wash|hot|sulph|sulf/i.test(name ?? ""))) continue;
  const op = clean(t.operator);
  const item = {
    t: k, n: name ?? "", c: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5], e: ele, km, d,
    id: `${el.type[0]}${el.id}`,
  };
  const cap = num(t.capacity ?? t.beds);
  if (cap && (k === "hut" || k === "camp")) item.cap = cap;
  if (op) item.op = /conservation/i.test(op) ? "DOC" : op.slice(0, 60);
  const url = clean(t.website ?? t["contact:website"] ?? t.url);
  if (url && /^https?:\/\//.test(url)) item.url = url;
  if (t.fee) item.fee = /^(no|non)$/i.test(t.fee) ? 0 : 1;
  if (t.reservation && /required|yes/i.test(t.reservation)) item.book = 1;
  if (t.drinking_water === "yes") item.water = 1;
  if (k === "water") {
    if (t.natural === "spring") item.spr = 1;
    if (t.drinking_water === "yes" || (t.amenity === "drinking_water" && t.drinking_water !== "no")) item.pot = 1;
    if (t.drinking_water === "no") item.pot = 0;
  }
  if (t.toilets === "yes") item.wc = 1;
  if (k === "hut" && /biv/i.test(name ?? "")) item.biv = 1;
  if (k === "shop") item.sub = shopKind(t);
  items.push(item);
}

// the same place mapped twice (node + area, or two nodes): keep the richer one
items.sort((a, b) => Object.keys(b).length - Object.keys(a).length);
const kept = [];
for (const it of items) {
  const dup = kept.find((k) => k.t === it.t && (k.n ?? "") === (it.n ?? "") &&
    Math.abs(k.c[0] - it.c[0]) < 0.004 && Math.abs(k.c[1] - it.c[1]) < 0.003);
  // two taps next to each other are one water point
  const nearWater = it.t === "water" && kept.find((k) => k.t === "water" && Math.abs(k.c[0] - it.c[0]) < 0.0015 && Math.abs(k.c[1] - it.c[1]) < 0.0011);
  if (!dup && !nearWater) kept.push(it);
}

// resupply: in each town, the best food shop (a supermarket before a general store before a convenience store),
// one outdoor shop, one post office, one visitor centre — not every dairy on the high street
const cluster = (a, b) => Math.abs(a.c[0] - b.c[0]) < 0.025 && Math.abs(a.c[1] - b.c[1]) < 0.018;
const food = (x) => x.t === "shop" && x.sub in SHOP_RANK;
const byQuality = kept.filter((x) => x.t === "shop").sort((a, b) => (SHOP_RANK[a.sub] ?? 9) - (SHOP_RANK[b.sub] ?? 9) || a.d - b.d);
const shopKeep = [];
for (const s of byQuality) {
  const taken = shopKeep.some((o) => cluster(o, s) && (food(s) ? food(o) : o.sub === s.sub));
  if (!taken) shopKeep.push(s);
}
for (let i = kept.length - 1; i >= 0; i--) if (kept[i].t === "shop" && !shopKeep.includes(kept[i])) kept.splice(i, 1);

// ---------------------------------------------------------------- the places chosen by hand
const round5 = (x) => Math.round(x * 1e5) / 1e5;
for (const c of CURATED) {
  const texts = { fr: c.fr, en: c.en, ...(c.src ? { src: c.src } : {}), ...(c.film ? { film: c.film } : {}) };
  if (c.upgrade) {
    const re = new RegExp(c.upgrade.name, "i");
    const hit = kept.find((k) => k.t === c.upgrade.t && re.test(k.n));
    if (!hit) { console.warn(`curated ${c.slug}: no ${c.upgrade.t} named ${c.upgrade.name}`); continue; }
    Object.assign(hit, { t: c.t, was: c.upgrade.t, ...texts });
    console.log(`curated ${c.slug}: ${hit.n} (${hit.t}, km ${hit.km}, ${hit.d} m)`);
    continue;
  }
  const cands = curatedEls.filter((el) => {
    const tg = el.tags ?? {};
    if (!c.find.names.includes(tg.name ?? "")) return false;
    if (c.find.tag && tg[c.find.tag[0]] !== c.find.tag[1]) return false;
    return (el.lat ?? el.center?.lat) !== undefined;
  }).map((el) => {
    const lon = el.lon ?? el.center.lon, lat = el.lat ?? el.center.lat;
    return { el, lon, lat, ...locate([lon, lat]) };
  }).filter((x) => x.d <= c.max);
  const preferred = c.prefer ? cands.filter((x) => new RegExp(c.prefer, "i").test(x.el.tags.name)) : [];
  const best = (preferred.length ? preferred : cands).sort((a, b) => a.d - b.d)[0];
  if (!best && c.wiki) {
    // not in the map data under that name: the coordinates of its Wikipedia article
    for (const title of c.wiki) {
      const w = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=coordinates&redirects=1&titles=${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } })).json();
      const co = Object.values(w.query?.pages ?? {})[0]?.coordinates?.[0];
      if (!co) continue;
      const at = locate([co.lon, co.lat]);
      if (at.d > c.max) { console.warn(`curated ${c.slug}: wikipedia ${title} is ${at.d} m away`); continue; }
      const pt = c.snap ? at.at : [round5(co.lon), round5(co.lat)];
      kept.push({ id: `x-${c.slug}`, t: c.t, n: c.n, ...(c.nfr ? { nfr: c.nfr } : {}), c: pt, e: null, km: at.km, d: c.snap ? 0 : at.d, ...texts });
      console.log(`curated ${c.slug}: wikipedia ${title} (km ${at.km}, ${at.d} m${c.snap ? ", on the trail" : ""})`);
      break;
    }
    if (kept.some((k) => k.id === `x-${c.slug}`)) continue;
  }
  if (!best) {
    const seen = curatedEls.filter((el) => c.find.names.includes(el.tags?.name)).map((el) => `${el.type}/${el.id} ${JSON.stringify(el.tags).slice(0, 120)}`);
    console.warn(`curated ${c.slug}: not found within ${c.max} m${seen.length ? ` (seen: ${seen.join(" | ")})` : ""}`);
    continue;
  }
  const usedOffset = c.offset && !(preferred.length && preferred.includes(best));
  const lon = round5(best.lon + (usedOffset ? c.offset[0] : 0)), lat = round5(best.lat + (usedOffset ? c.offset[1] : 0));
  const at = usedOffset ? locate([lon, lat]) : best;
  // a lake the route skirts, a bay it walks along: the pin goes on the trail itself
  const pt = c.snap ? at.at : [lon, lat];
  kept.push({
    id: `x-${c.slug}`, t: c.t, n: c.n, ...(c.nfr ? { nfr: c.nfr } : {}), c: pt, e: num(best.el.tags.ele), km: at.km, d: c.snap ? 0 : at.d, ...texts,
  });
  console.log(`curated ${c.slug}: ${best.el.tags.name} (${best.el.type}/${best.el.id}${usedOffset ? ", offset" : ""}, km ${at.km}, ${at.d} m)`);
}
kept.sort((a, b) => a.km - b.km || a.d - b.d);

const counts = kept.reduce((m, it) => ((m[it.t] = (m[it.t] ?? 0) + 1), m), {});
console.log("kept", kept.length, counts);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({
  v: 1, generated: new Date().toISOString().slice(0, 10),
  source: "© OpenStreetMap contributors (ODbL)", trail: trail.v ?? null, pois: kept,
}));
console.log("written", out);
