// Development-only sample data (loaded with ?mock). Never bundled in production.
// Close to the real thing: real huts and towns of the South Island route, elevation profiles,
// stories of different lengths, photos with and without GPS.
import type { Day, DayReactions, Media, Position, Settings } from "../types";
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
    site_tagline_fr: "L'île du Sud à pied avec Ewan",
    site_tagline_en: "The South Island on foot with Ewan",
    hiker_name: "Ewan",
    intro_fr: "Salut ! Je pars marcher les 1 334 km de l'île du Sud sur le Te Araroa, de Ship Cove à Bluff.\n\nIci, je publie chaque jour où je suis, mes photos et quelques mots quand j'ai du réseau. Laissez-moi un mot dans le livre de refuge, je les lis tous le soir.",
    intro_en: "Hi! I'm walking the 1,334 km of the South Island on Te Araroa, from Ship Cove to Bluff.\n\nI post where I am, my photos and a few words every day when I have signal. Leave me a note in the hut book, I read them all at night.",
    start_date: start, target_end_date: null, direction: "sobo", position_delay_minutes: 0,
    linz_api_key: null, trail_version: "2026-27", trail_total_km: route.total,
  };
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
  const reactions: Record<string, DayReactions> = {};
  for (const d of days) reactions[d.id] = { heart: { total: Math.floor(rnd() * 14), mine: rnd() > 0.7 }, clap: { total: Math.floor(rnd() * 6), mine: false } };
  return { settings, days, media, positions, reactions };
}

