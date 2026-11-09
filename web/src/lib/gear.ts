// "Mon sac": the gear list Ewan writes in the Carnet (settings.gear), shown on the site's pack page.
// Thru-hikers' convention: the base weight is everything carried, minus what is worn and what gets eaten or drunk.

import type { Lang } from "../types";

export type GearCat = "pack" | "sleep" | "kitchen" | "water" | "clothes" | "tech" | "care" | "misc" | "food";
/** in the order the page shows them: the big three first, what gets eaten last */
export const GEAR_CATS: GearCat[] = ["pack", "sleep", "kitchen", "water", "clothes", "tech", "care", "misc", "food"];

export interface GearItem {
  id: string;
  cat: GearCat;
  name: string;
  name_en?: string | null;
  /** brand, model */
  detail?: string | null;
  /** grams, for one */
  g: number;
  qty?: number;
  /** on him, not in the pack */
  worn?: boolean;
  /** his words */
  note?: string | null;
}

export interface Gear {
  items: GearItem[];
  /** his whole kit laid out on the floor (a path in the media bucket) */
  photo?: string | null;
  photo_w?: number | null;
  photo_h?: number | null;
  note_fr?: string | null;
  note_en?: string | null;
}

export const itemG = (i: GearItem) => Math.max(0, i.g || 0) * Math.max(1, i.qty || 1);
export const isBase = (i: GearItem) => !i.worn && i.cat !== "food";
/** what a section weighs in the pack (what it eats, for the food): the same figure as its bar */
export const sectionG = (list: GearItem[]) => list.reduce((s, i) => s + (i.cat === "food" || !i.worn ? itemG(i) : 0), 0);

export interface GearTotals {
  base: number;
  worn: number;
  food: number;
  n: number;
  /** base weight by category (worn items and food left out), heaviest first */
  byCat: { cat: GearCat; g: number }[];
}

export function gearTotals(items: GearItem[]): GearTotals {
  const by = new Map<GearCat, number>();
  let base = 0, worn = 0, food = 0, n = 0;
  for (const i of items) {
    const g = itemG(i);
    n += Math.max(1, i.qty || 1);
    if (i.cat === "food") food += g;
    else if (i.worn) worn += g;
    else { base += g; by.set(i.cat, (by.get(i.cat) ?? 0) + g); }
  }
  const byCat = [...by.entries()].filter(([, g]) => g > 0).map(([cat, g]) => ({ cat, g })).sort((a, b) => b.g - a.g);
  return { base, worn, food, n, byCat };
}

const loc = (l: Lang) => (l === "fr" ? "fr-FR" : "en-NZ");
/** 980 g, 1,4 kg (one decimal: what a scale says) */
export function fmtWeight(g: number, l: Lang, digits = 1): string {
  if (!Number.isFinite(g)) return "–";
  if (Math.abs(g) < 1000) return `${new Intl.NumberFormat(loc(l), { maximumFractionDigits: 0 }).format(g)} g`;
  return `${new Intl.NumberFormat(loc(l), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(g / 1000)} kg`;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// ------------------------------------------------------------------ a pasted list → items
// From the Notes app ("Tente Durston X-Mid 1, 794 g", "2x Chaussettes Darn Tough 60g", a "Dormir :" line as a
// heading), or a LighterPack CSV export. The category is guessed from words; Ewan checks it after.

const WORDS: [GearCat, RegExp][] = [
  ["food", /\b(nourriture|food|repas|meals?|snacks?|barres?|bars?|gaz|gas|fuel|cartouche|canister|ravitaillement)\b|^eau\b|^water\b/i],
  ["sleep", /\b(tente|tent|abri|shelter|tarp|bivy|bivouac|sac de couchage|sleeping bag|duvet|quilt|matelas|mat|matress|mattress|oreiller|pillow|piquets?|stakes?|pegs?|drap|liner|couverture)\b/i],
  ["pack", /\b(sac à dos|backpack|rucksack|sac étanche|dry ?bags?|pack ?liner|stuff ?sacks?|housse|pochettes?|pouch|ziploc|sacs?)\b/i],
  ["kitchen", /\b(réchaud|stove|popote|pot|casserole|cuill[eè]re|spoon|spork|briquet|lighter|allumettes|tasse|mug|bol|bowl|gamelle|couteau|knife)\b/i],
  ["water", /\b(gourdes?|bouteilles?|bottles?|filtre|filter|sawyer|katadyn|befree|smartwater|poche à eau|bladder|aquatabs|pastilles|purification)\b/i],
  ["clothes", /\b(veste|jacket|doudoune|puffy|polaire|fleece|pantalon|pants|short|shorts|t-?shirt|tee|chemise|shirt|chaussettes?|socks?|caleçon|boxer|underwear|slip|brassi[eè]re|bonnet|beanie|gants?|gloves?|moufles|casquette|cap|chapeau|hat|chaussures?|shoes?|trail runners?|baskets|guêtres|gaiters|pluie|rain|buff|tour de cou|sous-vêtements?|collant|leggings?|base ?layer|manches)\b/i],
  ["tech", /\b(téléphone|phone|iphone|batterie|power ?bank|câbles?|cables?|chargeur|charger|frontale|headlamp|lampe|montre|watch|inreach|plb|balise|beacon|écouteurs|earbuds|airpods|appareil photo|camera|gps|liseuse|kindle)\b/i],
  ["care", /\b(trousse|first ?aid|pharmacie|secours|crème|cream|solaire|sunscreen|brosse à dents|toothbrush|dentifrice|toothpaste|papier toilette|toilet|truelle|trowel|savon|soap|médicaments|meds|compeed|pansements?|bandages?|anti-?moustiques?|repellent|insect|lingettes|wipes|serviette|towel|lunettes|sunglasses|hygiène)\b/i],
];
// accents off on both sides, so that \b works on "écouteurs" or "porté" as on plain English
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const plainRe = (re: RegExp) => new RegExp(plain(re.source), re.flags);
for (const w of WORDS) w[1] = plainRe(w[1]);
export function guessCat(text: string): GearCat {
  const t = plain(text);
  for (const [cat, re] of WORDS) if (re.test(t)) return cat;
  return "misc";
}

const toG = (n: number, unit: string) => {
  const u = unit.toLowerCase();
  return Math.round(u.startsWith("kg") ? n * 1000 : u.startsWith("oz") ? n * 28.3495 : u.startsWith("lb") ? n * 453.592 : n);
};
const num = (s: string) => parseFloat(s.replace(",", "."));

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const HEADINGS: [GearCat, RegExp][] = [
  ["sleep", /^(dormir|sommeil|couchage|abri|nuit|sleep|sleeping|shelter|sleep system)( et .*| & .*| and .*)?$/i],
  ["pack", /^(sac|sac à dos|portage|rangement|pack|backpack|packing|storage)( et .*| & .*| and .*)?$/i],
  ["kitchen", /^(cuisine|popote|repas|kitchen|cooking|cook system)( et .*| & .*| and .*)?$/i],
  ["water", /^(eau|hydratation|water|hydration)( et .*| & .*| and .*)?$/i],
  ["clothes", /^(vêtements|vetements|habits|clothes|clothing|worn|porté|portés)( et .*| & .*| and .*)?$/i],
  ["tech", /^(électronique|electronique|tech|électronique et navigation|electronics|navigation)( et .*| & .*| and .*)?$/i],
  ["care", /^(soins|santé|hygiène|hygiene|trousse|first aid|toiletries|health)( et .*| & .*| and .*)?$/i],
  ["food", /^(nourriture|consommables|food|consumables)( et .*| & .*| and .*)?$/i],
  ["misc", /^(divers|autres?|misc|other|miscellaneous)$/i],
];
for (const h of HEADINGS) h[1] = plainRe(h[1]);
const headingCat = (s: string): GearCat | null => HEADINGS.find(([, re]) => re.test(plain(s)))?.[0] ?? (guessCat(s) !== "misc" ? guessCat(s) : null);
const WORN = plainRe(/\b(portee?s?|worn|sur moi)\b/i);

export function parseGearList(text: string): GearItem[] {
  const t = text.replace(/ | /g, " ").trim();
  if (!t) return [];
  // LighterPack: "Item Name,Category,desc,qty,weight,unit,url,price,worn,consumable"
  if (/^item name\s*,\s*category/i.test(t)) {
    const [head, ...rows] = csvRows(t);
    const col = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
    const [cN, cC, cD, cQ, cW, cU, cWo, cCo] = ["item name", "category", "desc", "qty", "weight", "unit", "worn", "consumable"].map(col);
    return rows.map((r) => {
      const name = (r[cN] ?? "").trim();
      const consumable = /^(1|true|yes|x)$/i.test((r[cCo] ?? "").trim());
      const cat = consumable ? "food" : guessCat(`${name} ${r[cC] ?? ""}`) === "misc" ? guessCat(r[cC] ?? "") : guessCat(`${name} ${r[cC] ?? ""}`);
      return { id: newId(), cat, name, detail: (r[cD] ?? "").trim() || null, g: toG(num(r[cW] ?? "0") || 0, r[cU] || "g"), qty: Math.max(1, parseInt(r[cQ] ?? "1", 10) || 1),
        worn: /^(1|true|yes|x)$/i.test((r[cWo] ?? "").trim()) || undefined } as GearItem;
    }).filter((i) => i.name);
  }
  const out: GearItem[] = [];
  let heading: GearCat | null = null;
  for (const raw of t.split(/\n/)) {
    let line = raw.replace(/^[\s\-–—•*·◦▪]+/, "").trim();
    if (!line) continue;
    const w = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grammes?|grams?|oz|lbs?)\b/i);
    // a heading: "Dormir :", "# Cuisine", "SLEEP" (a line without a weight, ending with ":", or a category's name)
    const bare = line.replace(/^#+\s*|\s*:\s*$/g, "").trim();
    if (!w && (/:\s*$|^#/.test(line) || HEADINGS.some(([, re]) => re.test(plain(bare))))) { heading = headingCat(bare) ?? heading; continue; }
    let qty = 1;
    const q = line.match(/(?:^|\s)(\d+)\s*[x×]\s+|\s[x×]\s*(\d+)\b/i);
    if (q) { qty = parseInt(q[1] ?? q[2], 10) || 1; line = line.replace(q[0], " "); }
    const g = w ? toG(num(w[1]), w[2]) : 0;
    let name = (w ? line.replace(w[0], " ") : line).replace(/\s*[,;:–—-]+\s*$/, "").replace(/\s{2,}/g, " ").trim();
    let detail: string | null = null;
    const par = name.match(/\(([^)]+)\)/);
    if (par) { detail = par[1].trim(); name = name.replace(par[0], "").trim(); }
    name = name.replace(/[,;:–—-]+$/, "").trim();
    // "(porté)", "worn", "sur moi": on him, not in the pack
    const worn = WORN.test(plain(`${name} ${detail ?? ""}`)) || undefined;
    if (detail && WORN.test(plain(detail))) detail = plain(detail).replace(WORN, "").replace(/^[\s,;]+|[\s,;]+$/g, "") ? detail.replace(/\s*\b(port[ée]e?s?|worn|sur moi)\b\s*/iu, " ").replace(/^[\s,;]+|[\s,;]+$/g, "") || null : null;
    if (WORN.test(plain(name))) name = name.replace(/\s*(port[ée]e?s?|worn|sur moi)\s*$/iu, "").trim();
    if (!name) continue;
    const guessed = guessCat(`${name} ${detail ?? ""}`);
    out.push({ id: newId(), cat: guessed !== "misc" ? guessed : heading ?? "misc", name, detail, g, qty, worn });
  }
  return out;
}
