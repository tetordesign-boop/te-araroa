// Photos of the road trip's places, for the itinerary doc: each place's lead image on English Wikipedia (free licence
// only), at 1280 px, with its author and licence from Wikimedia Commons. Usage: node fetch.mjs <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "TeAraroaItineraryDoc/1.0 (https://github.com/tetordesign-boop/te-araroa)" };
const PLACES = [
  ["blue-pools", "Blue Pools Makarora Haast"],
  ["lake-matheson", "Lake Matheson"],
  ["franz-josef", "Franz Josef Glacier"],
  ["hokitika-gorge", "Hokitika Gorge"],
  ["pancake-rocks", "Pancake Rocks Punakaiki"],
  ["queen-charlotte", "Queen Charlotte Sound Tōtaranui"],
  ["wellington", "Wellington Harbour"],
  ["cape-palliser", "Cape Palliser"],
  ["napier", "Napier art deco"],
  ["te-mata", "Te Mata Peak"],
  ["huka-falls", "Huka Falls"],
  ["tongariro", "Tongariro Alpine Crossing"],
  ["taranaki", "Mount Taranaki"],
  ["three-sisters", "Three Sisters Tongaporutu"],
  ["waitomo", "Waitomo Glowworm Caves"],
  ["bridal-veil", "Bridal Veil Falls Waikato"],
  ["poor-knights", "Poor Knights Islands"],
  ["bay-of-islands", "Bay of Islands"],
  ["cape-reinga", "Cape Reinga"],
  ["tane-mahuta", "Tāne Mahuta"],
  ["cathedral-cove", "Cathedral Cove Coromandel"],
  ["hot-water-beach", "Hot Water Beach Coromandel"],
  ["karangahake", "Karangahake Gorge"],
  ["wai-o-tapu", "Wai-O-Tapu"],
  ["hobbiton", "Hobbiton Movie Set"],
  ["rangitoto", "Rangitoto Island"],
  ["piha", "Piha Lion Rock"],
  ["ship-cove", "Ship Cove Meretoto"],
];
const strip = (h) => String(h ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const credits = [];
for (const [slug, q] of PLACES) {
  try {
    const w = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=pageimages&piprop=name&pilicense=free`, { headers: UA })).json();
    const pages = Object.values(w.query?.pages ?? {}).sort((a, b) => a.index - b.index);
    const page = pages.find((p) => p.pageimage);
    if (!page) { credits.push({ slug, q, error: "no free lead image" }); continue; }
    const c = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent("File:" + page.pageimage)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1280`, { headers: UA })).json();
    const info = Object.values(c.query?.pages ?? {})[0]?.imageinfo?.[0];
    if (!info) { credits.push({ slug, q, article: page.title, file: page.pageimage, error: "not on Commons" }); continue; }
    const url = info.thumburl ?? info.url;
    const ext = url.toLowerCase().endsWith(".png") ? "png" : "jpg";
    const bytes = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
    writeFileSync(`${OUT}/${slug}.${ext}`, bytes);
    const m = info.extmetadata ?? {};
    credits.push({ slug, q, article: page.title, file: page.pageimage, page: info.descriptionurl, author: strip(m.Artist?.value), license: strip(m.LicenseShortName?.value), w: info.thumbwidth, h: info.thumbheight, kb: Math.round(bytes.length / 1024) });
    console.log(`${slug}: ${page.title} → ${page.pageimage} (${strip(m.LicenseShortName?.value)})`);
  } catch (e) { credits.push({ slug, q, error: String(e).slice(0, 200) }); console.log(`${slug}: ERROR ${e}`); }
}
writeFileSync(`${OUT}/credits.json`, JSON.stringify(credits, null, 2));
