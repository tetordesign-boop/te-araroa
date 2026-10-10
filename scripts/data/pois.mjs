// Points of interest along the trail, from OpenStreetMap (© OpenStreetMap contributors, ODbL):
// huts, campsites, passes, peaks, waterfalls, viewpoints. Each one gets its km on the trail and its
// distance from it, so the site can say "km 412, 1.2 km off the trail".
// Usage: node scripts/data/pois.mjs <out.json> [trail.json path or URL]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
out tags;`);
console.log(`overpass: ${general.length} general, ${peaks.length} peaks`);

const num = (v) => {
  if (v === undefined || v === null) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(v));
  return m ? Math.round(parseFloat(m[0].replace(",", "."))) : null;
};
const clean = (s) => (s ? String(s).replace(/\s+/g, " ").trim() : null);

function kind(t) {
  if (t.tourism === "alpine_hut" || t.tourism === "wilderness_hut" || t.amenity === "shelter") return "hut";
  if (t.tourism === "camp_site") return "camp";
  if (t.tourism === "viewpoint") return "view";
  if (t.natural === "saddle" || t.mountain_pass === "yes") return "pass";
  if (t.waterway === "waterfall" || t.natural === "waterfall") return "fall";
  if (t.natural === "peak" || t.natural === "volcano") return "peak";
  return null;
}

// how far from the trail each kind is still worth showing (metres)
function keep(k, d, ele, named) {
  switch (k) {
    case "hut": return d <= 2500;
    case "camp": return d <= 1500;
    case "pass": return d <= 2000;
    case "view": return named && d <= 1200;
    case "fall": return d <= 2000;
    case "peak": return d <= 3000 || (ele !== null && ele >= 1800 && d <= 8000) || (ele !== null && ele >= 2800 && d <= 16000);
    default: return false;
  }
}

const items = [];
for (const el of [...general, ...peaks]) {
  const t = el.tags ?? {};
  const k = kind(t);
  if (!k) continue;
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) continue;
  const name = clean(t.name);
  const ele = num(t.ele);
  const { km, d } = locate([lon, lat]);
  if (!keep(k, d, ele, !!name)) continue;
  if (!name && k !== "camp" && k !== "hut") continue;
  const op = clean(t.operator);
  const item = {
    t: k, n: name, c: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5], e: ele, km, d,
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
  if (t.toilets === "yes") item.wc = 1;
  if (k === "hut" && /biv/i.test(name ?? "")) item.biv = 1;
  items.push(item);
}

// the same place mapped twice (node + area, or two nodes): keep the richer one
items.sort((a, b) => Object.keys(b).length - Object.keys(a).length);
const kept = [];
for (const it of items) {
  const dup = kept.find((k) => k.t === it.t && (k.n ?? "") === (it.n ?? "") &&
    Math.abs(k.c[0] - it.c[0]) < 0.004 && Math.abs(k.c[1] - it.c[1]) < 0.003);
  if (!dup) kept.push(it);
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
