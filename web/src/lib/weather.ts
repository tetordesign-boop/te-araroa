// Forecasts from Open-Meteo (free, no key; data CC BY 4.0, credited where it is shown). Pure fetch + cache, so both
// the site and the Carnet can use it: 20 minutes in memory and on the phone (localStorage), and the last forecast
// stays readable with no signal (`stale` tells how old it is).
export interface WxNow { temp: number; feels: number; code: number; wind: number; gust: number; precip: number; isDay: boolean }
export interface WxDay { date: string; code: number; max: number; min: number; rain: number; prob: number | null; gust: number }
export interface Forecast { now: WxNow; days: WxDay[]; at: number; elevation: number }

const FRESH = 20 * 60_000;
const mem = new Map<string, Forecast>();
const keyOf = (lat: number, lng: number, elev?: number | null) => `${lat.toFixed(2)},${lng.toFixed(2)}${elev != null ? `@${Math.round(elev / 50) * 50}` : ""}`;

function stored(key: string): Forecast | null {
  try { const v = localStorage.getItem(`wx:${key}`); return v ? (JSON.parse(v) as Forecast) : null; } catch (_) { return null; }
}

/** The cached forecast for a point, however old (for the days with no signal). */
export function cachedForecast(lat: number, lng: number, elev?: number | null): Forecast | null {
  const key = keyOf(lat, lng, elev);
  return mem.get(key) ?? stored(key);
}

/** Current weather and 4 days at a point; `elev` (m) makes Open-Meteo correct the temperatures for a pass or a hut. */
export async function getForecast(lat: number, lng: number, elev?: number | null): Promise<Forecast | null> {
  const key = keyOf(lat, lng, elev);
  const hit = mem.get(key) ?? stored(key);
  if (hit && Date.now() - hit.at < FRESH) { mem.set(key, hit); return hit; }
  const q = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lng.toFixed(3), timezone: "Pacific/Auckland", forecast_days: "4", wind_speed_unit: "kmh",
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",
  });
  if (elev != null) q.set("elevation", String(Math.round(elev)));
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!res.ok) return hit;
    const j = await res.json();
    const c = j.current, d = j.daily;
    const f: Forecast = {
      at: Date.now(), elevation: Math.round(j.elevation ?? elev ?? 0),
      now: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, precip: c.precipitation, isDay: c.is_day === 1 },
      days: (d.time as string[]).map((date, i) => ({
        date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_sum[i] ?? 0,
        prob: d.precipitation_probability_max?.[i] ?? null, gust: d.wind_gusts_10m_max[i] ?? 0,
      })),
    };
    mem.set(key, f);
    try { localStorage.setItem(`wx:${key}`, JSON.stringify(f)); } catch (_) { /* full or private */ }
    return f;
  } catch (_) {
    return hit; // no signal: the last one we had
  }
}

/** A day of a forecast by date (YYYY-MM-DD). */
export const dayOf = (f: Forecast | null, date: string) => f?.days.find((d) => d.date === date) ?? null;
