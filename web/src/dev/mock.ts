// Development-only sample data (loaded with ?mock). Never bundled in production.
import type { Day, DayReactions, Media, Message, Position, Settings } from "../types";
import type { Route } from "../lib/geo";

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const SKIES = [
  ["#f6c89f", "#f3a683", "#7a8fb5"], ["#9cc8f2", "#d9ecfb", "#5d7fa8"], ["#c9d3dc", "#e9eef2", "#6e7f8d"],
  ["#ffd9a8", "#ffb27a", "#4d5d84"], ["#a7d3f0", "#eaf5fc", "#3f6b5c"],
];
function landscape(w: number, h: number): string {
  const [s1, s2, deep] = pick(SKIES);
  const layers: string[] = [];
  const greens = ["#3f6b5c", "#2f5546", "#5b7f6b", "#4a6a80", "#33475e"];
  for (let L = 0; L < 3; L++) {
    const base = h * (0.45 + L * 0.15);
    let d = `M0 ${h} L0 ${base}`;
    const steps = 7 + L * 3;
    for (let i = 1; i <= steps; i++) {
      const x = (w / steps) * i;
      const y = base - (rnd() * h * (0.32 - L * 0.08));
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    d += ` L${w} ${h} Z`;
    layers.push(`<path d="${d}" fill="${L === 0 ? deep : pick(greens)}" opacity="${0.75 + L * 0.1}"/>`);
  }
  const lake = rnd() > 0.5 ? `<rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="#7fb3d5" opacity=".7"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${layers.join("")}${lake}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const STORIES = [
  "Départ sous un ciel parfait. Le bateau nous a déposés à Ship Cove vers 9 h, et les premiers kilomètres longent la baie dans une forêt pleine d'oiseaux. Les wekas viennent voler les miettes du pique-nique.",
  "Grosse journée dans la Richmond Range. Montée raide jusqu'à la crête, vent fort, mais la vue sur les Marlborough Sounds valait chaque pas. Nuit au refuge avec deux Allemands et une Canadienne.",
  "Pluie toute la matinée, les rivières ont monté. On a attendu deux heures au bord de la Wairau avant de traverser en groupe. Pieds mouillés, moral intact.",
  "Jour de repos à St Arnaud : douche, lessive, et un énorme burger au Lodge. J'ai racheté du gaz et des barres pour les six prochains jours.",
  "Le col de Waiau ! Pierriers, neige résiduelle et un silence incroyable au sommet. Descente lente sur le versant sud. Blue Lake était d'un bleu irréel.",
];

export async function mockData(route: Route) {
  const start = "2026-11-28";
  const settings: Settings = {
    site_title: "Te Araroa",
    site_tagline_fr: "L'île du Sud à pied avec Ewan",
    site_tagline_en: "The South Island on foot with Ewan",
    hiker_name: "Ewan",
    intro_fr: "Salut ! Je pars marcher les 1 334 km de l'île du Sud sur le Te Araroa, de Ship Cove à Bluff. Ici, je publie chaque jour où je suis, mes photos et quelques mots quand j'ai du réseau.",
    intro_en: "Hi! I'm walking the 1,334 km of the South Island on Te Araroa, from Ship Cove to Bluff. I post where I am, my photos and a few words every day when I have signal.",
    start_date: start, target_end_date: null, direction: "sobo", position_delay_minutes: 0,
    linz_api_key: null, trail_version: "2026-27", trail_total_km: route.total,
  };
  const days: Day[] = [];
  const media: Media[] = [];
  let km = 0;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const date = new Date(Date.UTC(2026, 10, 28 + i)).toISOString().slice(0, 10);
    const kind = i === 9 ? "rest" : "hike";
    const dist = kind === "rest" ? 0 : 14 + Math.round(rnd() * 16);
    const k0 = km, k1 = Math.min(route.total, km + dist);
    km = k1;
    const a = route.around(k0), b = route.around(k1);
    const p0 = route.pointAt(k0), p1 = route.pointAt(k1);
    const id = `day-${i + 1}`;
    days.push({
      id, date, day_number: i + 1, kind: kind as Day["kind"],
      title: kind === "rest" ? `Repos à ${a.prev.n}` : null, title_en: null,
      story: pick(STORIES), story_en: null,
      start_km: k0, end_km: k1, start_lng: p0[0], start_lat: p0[1], end_lng: p1[0], end_lat: p1[1],
      start_name: i === 0 ? "Ship Cove" : `${a.prev.n.split(" ·")[0]} +${Math.round(k0 - a.prev.km)} km`,
      end_name: `${b.prev.n.split(" ·")[0]} +${Math.round(k1 - b.prev.km)} km`,
      distance_km: dist, ascent_m: kind === "rest" ? 0 : Math.round(300 + rnd() * 1400), descent_m: Math.round(300 + rnd() * 1200),
      moving_time_min: kind === "rest" ? null : Math.round(300 + rnd() * 300),
      weather: pick(["☀️", "⛅", "🌧️", "🌤️"]), mood: pick(["😄", "😊", "🥵", "😴"]),
      cover_media_id: null, track: null, published: true,
      created_at: date + "T09:00:00Z", updated_at: date + "T09:00:00Z",
    });
    const n = kind === "rest" ? 2 : 3 + Math.floor(rnd() * 6);
    for (let j = 0; j < n; j++) {
      const portrait = rnd() > 0.7;
      const w = portrait ? 800 : 1200, h = portrait ? 1100 : 800;
      const url = landscape(w, h);
      media.push({
        id: `${id}-m${j}`, day_id: id, kind: j === 2 && i % 3 === 0 ? "video" : "photo",
        path: url, thumb_path: url, embed_url: null, width: w, height: h, duration_s: j === 2 ? 14 : null,
        taken_at: `${date}T${String(7 + j).padStart(2, "0")}:${String(Math.floor(rnd() * 59)).padStart(2, "0")}:00+13:00`,
        lng: null, lat: null, caption: j === 0 ? "Premier coup d'œil sur la vallée" : null, caption_en: null, sort: j,
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
  const messageCounts: Record<string, number> = {};
  for (const d of days) messageCounts[d.id] = Math.floor(rnd() * 4);
  return { settings, days, media, positions, reactions, messageCounts };
}

export function mockMessages(dayId: string | null): Message[] {
  const base = [
    { author: "Maman", body: "Quelles photos ! Prends soin de tes pieds et mange bien. On pense fort à toi ❤️" },
    { author: "Léa", body: "Trop beau ce lac !! Tu me ramènes un kiwi ?" },
    { author: "Papi Jo", body: "Bravo champion, encore 1 000 km et c'est dans la poche." },
  ];
  return base.map((b, i) => ({ id: `${dayId}-msg${i}`, day_id: dayId, author: b.author, body: b.body, created_at: new Date(Date.now() - (i + 1) * 3600e3 * 5).toISOString() }));
}
