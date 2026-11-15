// A few candidates per place from Wikimedia Commons search (free licences), to choose from by eye.
// Usage: node search.mjs <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "TeAraroaItineraryDoc/1.0 (https://github.com/tetordesign-boop/te-araroa)" };
const QUERIES = [
  ["blue-pools", "Blue Pools Makarora"],
  ["tongariro", "Emerald Lakes Tongariro"],
  ["poor-knights", "Poor Knights Islands"],
  ["te-mata", "Te Mata Peak view"],
  ["bay-of-islands", "Motukokako Hole in the Rock"],
];
const strip = (h) => String(h ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const credits = [];
for (const [slug, q] of QUERIES) {
  const s = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1280`, { headers: UA })).json();
  const pages = Object.values(s.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  let n = 0;
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || info.width < 1000 || info.width < info.height) continue;
    const m = info.extmetadata ?? {};
    const lic = strip(m.LicenseShortName?.value);
    if (!/^(CC0|CC BY|Public domain|PD)/i.test(lic)) continue;
    n++;
    const name = `${slug}-${n}.jpg`;
    writeFileSync(`${OUT}/${name}`, Buffer.from(await (await fetch(info.thumburl, { headers: UA })).arrayBuffer()));
    credits.push({ name, file: p.title, page: info.descriptionurl, author: strip(m.Artist?.value), license: lic });
    console.log(`${name}: ${p.title} (${lic})`);
    if (n >= 4) break;
  }
}
writeFileSync(`${OUT}/credits.json`, JSON.stringify(credits, null, 2));
