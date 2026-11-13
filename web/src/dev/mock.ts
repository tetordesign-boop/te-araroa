// Development-only sample data (loaded with ?mock). Never bundled in production.
// Close to the real thing: real huts and towns of the South Island route, elevation profiles,
// stories of different lengths, photos with and without GPS.
import type { Question, Day, DayReactions, Media, Position, Settings } from "../types";
import type { Route } from "../lib/geo";

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

/** Painterly placeholder "photos": sky, ranges fading with distance, sometimes a lake. */
const SKIES = [
  ["#f9d6b0", "#f2a77e", "#c98b7e"], ["#a9cdee", "#e4f0fa", "#8aa9c6"], ["#cfd8df", "#eef2f4", "#9aa8b3"],
  ["#ffe1b8", "#ffb98a", "#a58aa0"], ["#9fd0f0", "#f1f8fd", "#7fa6bd"],
];
const RANGES = [["#6d8796", "#4f6b5d", "#33503f", "#22362b"], ["#8b9bb0", "#5f7488", "#3e5568", "#283a48"], ["#93a49a", "#667f6e", "#45604e", "#2c4033"]];
function landscape(w: number, h: number): string {
  const [s1, s2, haze] = pick(SKIES);
  const ranges = pick(RANGES);
  const layers: string[] = [];
  const sunX = (0.2 + rnd() * 0.6) * w, sunY = h * (0.18 + rnd() * 0.15);
  layers.push(`<circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${(h * 0.06).toFixed(0)}" fill="#fff8e6" opacity=".75"/>`);
  for (let L = 0; L < 4; L++) {
    const base = h * (0.42 + L * 0.12);
    let d = `M0 ${h} L0 ${base.toFixed(0)}`;
    const steps = 6 + L * 4;
    for (let i = 1; i <= steps; i++) {
      const x = (w / steps) * i;
      const y = base - rnd() * h * (0.26 - L * 0.05);
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    d += ` L${w} ${h} Z`;
    layers.push(`<path d="${d}" fill="${ranges[L]}"/>`);
    if (L < 3) layers.push(`<rect width="${w}" height="${h}" fill="${haze}" opacity=".12"/>`);
  }
  if (rnd() > 0.5) {
    const y = h * 0.8;
    layers.push(`<rect x="0" y="${y.toFixed(0)}" width="${w}" height="${(h - y).toFixed(0)}" fill="#7fb0c9"/><rect x="0" y="${y.toFixed(0)}" width="${w}" height="${(h * 0.02).toFixed(0)}" fill="#fff" opacity=".35"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${layers.join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Huts, campsites and towns along the southbound route, km from Ship Cove (close enough for a mock). */
const STOPS: [number, string][] = [
  [0, "Ship Cove"], [14.5, "Furneaux Lodge"], [26.5, "Camp Bay"], [50.5, "Portage"], [69.6, "Anakiwa"], [91, "Havelock"],
  [111.2, "Pelorus Bridge"], [124, "Captain Creek Hut"], [133, "Rocks Hut"], [151, "Hunters Hut"], [166, "Starveall Hut"],
  [182, "Mt Rintoul Hut"], [196, "Tarn Hut"], [208, "Top Wairoa Hut"], [236, "Red Hills Hut"], [252.2, "St Arnaud"],
  [262, "Lakehead Hut"], [280, "Upper Travers Hut"], [291, "West Sabine Hut"], [300, "Blue Lake Hut"], [304.5, "Waiau Pass"],
  [340, "Anne Hut"], [382.2, "Boyle Village"],
];
const stopNear = (km: number) => STOPS.reduce((b, s) => (Math.abs(s[0] - km) < Math.abs(b[0] - km) ? s : b));

const STORIES = [
  "Départ sous un ciel parfait. Le bateau nous a déposés à Ship Cove vers 9 h, et les premiers kilomètres longent la baie dans une forêt pleine d'oiseaux.\n\nLes wekas viennent voler les miettes du pique-nique. Je crois que je vais aimer ce pays.",
  "Grosse journée dans la Richmond Range. Montée raide jusqu'à la crête, vent fort, mais la vue sur les Marlborough Sounds valait chaque pas. Nuit au refuge avec deux Allemands et une Canadienne.",
  "Pluie toute la matinée, les rivières ont monté. On a attendu deux heures au bord de la Wairau avant de traverser en groupe, bras dessus bras dessous.\n\nPieds mouillés, moral intact. Le poêle du refuge a fait des miracles pour les chaussettes.",
  "Jour de repos : douche, lessive, et un énorme burger. J'ai racheté du gaz et des barres pour les six prochains jours.",
  "Le col de Waiau ! Pierriers, neige résiduelle et un silence incroyable au sommet. Descente lente sur le versant sud, en regardant chaque pas.\n\nBlue Lake était d'un bleu irréel, le plus clair du monde paraît-il. Je veux bien le croire.\n\nDemain, longue descente vers Anne Hut.",
  "Une journée sans histoire, et c'est très bien comme ça : forêt de hêtres, mousse partout, un kea qui m'a suivi une heure en essayant de manger ma sangle.",
];
const TITLES: Record<number, string> = { 0: "Premier jour, enfin", 6: "La crête de la Richmond Range", 13: "Le col de Waiau" };

function profile(k0: number, k1: number): { p: [number, number][] } {
  const n = 40;
  let e = 200 + rnd() * 600;
  const p: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    e = Math.max(60, Math.min(1900, e + (rnd() - 0.45) * 140));
    p.push([+(k0 + ((k1 - k0) * i) / n).toFixed(2), Math.round(e)]);
  }
  return { p };
}

export async function mockData(route: Route) {
  if (new URLSearchParams(location.search).has("slow")) await new Promise((r) => setTimeout(r, 6000));
  const start = "2026-11-28";
  const settings: Settings = {
    site_title: "Te Araroa",
    site_tagline_fr: "L'île du Sud à pied",
    site_tagline_en: "The South Island on foot",
    hiker_name: "Ewan",
    intro_fr: "Salut ! Je pars marcher les 1 334 km de l'île du Sud sur le Te Araroa, de Ship Cove à Bluff.\n\nIci, je publie chaque jour où je suis, mes photos et quelques mots quand j'ai du réseau. Laissez-moi un mot en bas de la page : je suis seul à les lire, le soir au refuge.",
    intro_en: "Hi! I'm walking the 1,334 km of the South Island on Te Araroa, from Ship Cove to Bluff.\n\nI post where I am, my photos and a few words every day when I have signal. Leave me a note at the bottom of the page: only I read them, at night in the hut.",
    start_date: start, target_end_date: null, direction: "sobo", position_delay_minutes: 0,
    linz_api_key: null, trail_version: "2026-27", trail_total_km: route.total,
    // (an invented list, for working on the page in dev: the real one is Ewan's, written in the Carnet)
    gear: new URLSearchParams(location.search).has("nogear") ? null : { note_fr: "Tout tient dans 55 litres. J'ai pesé chaque objet sur la balance de la cuisine.", items: [
      { id: "g1", cat: "pack", name: "Sac à dos", detail: "Durston Kakwa 55", g: 1050 },
      { id: "g2", cat: "pack", name: "Sac étanche", detail: "Nylofume", g: 28 },
      { id: "g3", cat: "pack", name: "Pochettes", detail: "Hyperlite", g: 18, qty: 3 },
      { id: "g4", cat: "sleep", name: "Tente", detail: "Durston X-Mid 1", g: 794, note: "Elle tient avec mes bâtons de marche." },
      { id: "g5", cat: "sleep", name: "Quilt", detail: "Enlightened Equipment Revelation -7 °C", g: 620 },
      { id: "g6", cat: "sleep", name: "Matelas", detail: "Thermarest NeoAir XLite NXT", g: 354 },
      { id: "g7", cat: "sleep", name: "Sardines", detail: "MSR Groundhog", g: 12, qty: 6 },
      { id: "g8", cat: "kitchen", name: "Réchaud", detail: "BRS-3000T", g: 25 },
      { id: "g9", cat: "kitchen", name: "Popote", detail: "Toaks 750 ml", g: 103 },
      { id: "g10", cat: "kitchen", name: "Cuillère longue", detail: "Toaks", g: 18 },
      { id: "g11", cat: "kitchen", name: "Briquet", g: 15 },
      { id: "g12", cat: "water", name: "Filtre", detail: "Sawyer Squeeze", g: 85 },
      { id: "g13", cat: "water", name: "Gourdes 1 L", detail: "Smartwater", g: 36, qty: 2 },
      { id: "g14", cat: "clothes", name: "Doudoune", detail: "Montbell Plasma 1000", g: 213 },
      { id: "g15", cat: "clothes", name: "Veste de pluie", detail: "Montbell Versalite", g: 184, note: "Indispensable sur le Richmond Range." },
      { id: "g16", cat: "clothes", name: "Surpantalon", g: 120 },
      { id: "g17", cat: "clothes", name: "Polaire", g: 160 },
      { id: "g18", cat: "clothes", name: "Bonnet et gants", g: 90 },
      { id: "g19", cat: "clothes", name: "Chaussettes de rechange", g: 60, qty: 2 },
      { id: "g20", cat: "clothes", name: "Short et t-shirt", g: 260, worn: true },
      { id: "g21", cat: "clothes", name: "Chaussures", detail: "Altra Lone Peak 8", g: 600, worn: true },
      { id: "g22", cat: "clothes", name: "Casquette et lunettes", g: 95, worn: true },
      { id: "g23", cat: "tech", name: "Téléphone", detail: "iPhone", g: 190, worn: true },
      { id: "g24", cat: "tech", name: "Batterie", detail: "Nitecore NB10000", g: 150 },
      { id: "g25", cat: "tech", name: "Balise de détresse", detail: "PLB, louée", g: 116 },
      { id: "g26", cat: "tech", name: "Frontale", detail: "Nitecore NU25", g: 28 },
      { id: "g27", cat: "tech", name: "Chargeur et câbles", g: 70 },
      { id: "g28", cat: "care", name: "Trousse de secours", g: 160 },
      { id: "g29", cat: "care", name: "Crème solaire", g: 60 },
      { id: "g30", cat: "care", name: "Brosse à dents et dentifrice", g: 35 },
      { id: "g31", cat: "care", name: "Truelle", detail: "Deuce of Spades", g: 17 },
      { id: "g32", cat: "misc", name: "Bâtons de marche", g: 300, worn: true },
      { id: "g33", cat: "misc", name: "Couteau", g: 20 },
      { id: "g34", cat: "misc", name: "Portefeuille et passeport", g: 80 },
      { id: "g35", cat: "food", name: "Nourriture pour cinq jours", g: 3500 },
      { id: "g36", cat: "food", name: "Eau", detail: "un litre", g: 1000 },
      { id: "g37", cat: "food", name: "Cartouche de gaz", g: 200 },
    ] },
  };
  if (new URLSearchParams(location.search).has("nocolumn")) delete settings.gear; // (the database before its "Mon sac" line)
  const days: Day[] = [];
  const media: Media[] = [];
  if (new URLSearchParams(location.search).has("before")) {
    const d = new Date(Date.now() + 49 * 86400e3).toISOString().slice(0, 10);
    return { settings: { ...settings, start_date: d }, days, media, positions: [] as Position[], reactions: {} as Record<string, DayReactions> };
  }
  let km = 0;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const date = new Date(Date.UTC(2026, 10, 28 + i)).toISOString().slice(0, 10);
    const kind = i === 10 ? "rest" : "hike";
    const dist = kind === "rest" ? 0 : 14 + Math.round(rnd() * 16);
    const k0 = km;
    // end each walking day at a real hut or town when one is close
    let k1 = Math.min(route.total, km + dist);
    const s = stopNear(k1);
    if (kind === "hike" && Math.abs(s[0] - k1) < 7 && s[0] > k0 + 6) k1 = s[0];
    km = k1;
    const p0 = route.pointAt(k0), p1 = route.pointAt(k1);
    const id = `day-${i + 1}`;
    const endStop = stopNear(k1), startStop = stopNear(k0);
    const story = kind === "rest" ? STORIES[3] : i === 13 ? STORIES[4] : pick(STORIES.filter((_, j) => j !== 3 && j !== 4));
    days.push({
      id, date, day_number: i + 1, kind: kind as Day["kind"],
      title: kind === "rest" ? `Repos à ${endStop[1]}` : TITLES[i] ?? null, title_en: null,
      story, story_en: null,
      start_km: k0, end_km: k1, start_lng: p0[0], start_lat: p0[1], end_lng: p1[0], end_lat: p1[1],
      start_name: Math.abs(startStop[0] - k0) < 9 ? startStop[1] : null,
      end_name: Math.abs(endStop[0] - k1) < 9 ? endStop[1] : null,
      distance_km: Math.round((k1 - k0) * 10) / 10, ascent_m: kind === "rest" ? null : Math.round(300 + rnd() * 1400), descent_m: kind === "rest" ? null : Math.round(300 + rnd() * 1200),
      moving_time_min: kind === "rest" ? null : Math.round(300 + rnd() * 300),
      weather: pick(["☀️", "⛅", "🌧️", "🌤️"]), mood: pick(["😄", "😊", "🥵", "😴"]),
      cover_media_id: null, track: kind === "hike" ? profile(k0, k1) : null, published: true,
      created_at: date + "T09:00:00Z", updated_at: date + "T09:00:00Z",
    });
    const n = kind === "rest" ? 2 : 2 + Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) {
      const portrait = rnd() > 0.72;
      const w = portrait ? 1200 : 1600, h = portrait ? 1600 : 1200;
      const url = landscape(w, h);
      const f = (j + 0.5) / n;
      const gps = rnd() > 0.4 ? route.pointAt(k0 + (k1 - k0) * f) : null;
      media.push({
        id: `${id}-m${j}`, day_id: id, kind: j === 2 && i % 3 === 0 ? "video" : "photo",
        path: url, thumb_path: url, embed_url: null, width: w, height: h, duration_s: j === 2 ? 14 : null,
        taken_at: `${date}T${String(7 + j).padStart(2, "0")}:${String(Math.floor(rnd() * 59)).padStart(2, "0")}:00+13:00`,
        lng: gps ? gps[0] : null, lat: gps ? gps[1] : null,
        caption: j === 0 && i % 2 === 0 ? "Premier coup d'œil sur la vallée" : null, caption_en: null, sort: j,
      });
    }
  }
  const now = Date.now();
  const positions: Position[] = [];
  for (let i = 0; i < 12; i++) {
    const p = route.pointAt(Math.min(route.total, km + i * 0.8));
    positions.push({ id: i + 1, recorded_at: new Date(now - (12 - i) * 20 * 60000).toISOString(), lng: p[0], lat: p[1], alt: 600, acc: 10, source: "owntracks", note: null });
  }
  // a voice note on a few days (a hum made here: no sound file to ship); ?novoice for none
  if (!new URLSearchParams(location.search).has("novoice")) {
    const tone = mockVoiceUrl();
    for (const d of days) if (d.day_number % 4 === 2 || d.day_number === days.length) d.voice = { path: tone, s: 9.6, peaks: mockPeaks(d.day_number) };
  }
  const reactions: Record<string, DayReactions> = {};
  for (const d of days) reactions[d.id] = { heart: { total: Math.floor(rnd() * 14), mine: rnd() > 0.7 }, clap: { total: Math.floor(rnd() * 6), mine: false } };
  return { settings, days, media, positions, reactions };
}


/** a few seconds of something like speech (a voice-band hum with syllables), as a WAV data URL */
let voiceUrl: string | null = null;
function mockVoiceUrl(): string {
  if (voiceUrl) return voiceUrl;
  const rate = 8000, n = Math.round(rate * 9.6), data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const syll = Math.max(0, Math.sin(t * Math.PI * 3.1)) ** 0.6 * (0.55 + 0.45 * Math.sin(t * 0.9));
    const f0 = 140 + 30 * Math.sin(t * 1.7);
    const v = (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(4 * Math.PI * f0 * t) + 0.25 * Math.sin(6 * Math.PI * f0 * t)) * syll;
    data[i] = Math.max(-1, Math.min(1, v * 0.35)) * 32767;
  }
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const str = (o: number, x: string) => { for (let k = 0; k < x.length; k++) dv.setUint8(o + k, x.charCodeAt(k)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(data);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return (voiceUrl = `data:audio/wav;base64,${btoa(bin)}`);
}
function mockPeaks(seed: number): number[] {
  return Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * 9.6;
    return Math.round((0.12 + 0.88 * Math.max(0, Math.sin(t * Math.PI * 3.1 + seed)) ** 0.6 * (0.55 + 0.45 * Math.sin(t * 0.9))) * 100) / 100;
  });
}

/** answered questions for the "Vos questions" page */
export function mockQuestions(): Question[] {
  const q = (id: string, author: string, body: string, answer: string, at: string): Question =>
    ({ id, author, body, answer, answer_en: null, published: true, answered_at: at, created_at: at });
  return [
    q("q3", "Mamie", "Est-ce que tu manges assez ?", "Oui, promis ! Beaucoup de nouilles, de beurre de cacahuète et de chocolat. Je mange deux fois plus qu'à la maison et je maigris quand même.\n\nAu prochain village, je rattrape tout en burger.", "2026-12-14T08:00:00Z"),
    q("q2", "Léo", "C'est quoi le plus dur pour l'instant ?", "Les rivières. On les traverse à pied, de l'eau jusqu'aux genoux, parfois aux cuisses. Il faut lire le courant et ne jamais y aller après la pluie.", "2026-12-09T08:00:00Z"),
    q("q1", "Claire", "Tu dors où, le soir ?", "Dans les refuges du DOC quand il y en a un, sinon sous la tente. Les refuges, c'est un toit, une table, et souvent d'autres marcheurs avec qui partager le repas.", "2026-12-03T08:00:00Z"),
  ];
}
