import { useEffect, useState } from "preact/hooks";
import { weatherLabel } from "../i18n";
import { clock, latestPosition } from "../lib/data";
import type { Lang } from "../types";

interface Wx { temp: number; code: number; at: number; key: string }
const cache = new Map<string, Wx>();

async function getWeather(lat: number, lng: number): Promise<Wx | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=temperature_2m,weather_code&timezone=Pacific%2FAuckland`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const wx = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, at: Date.now(), key };
    cache.set(key, wx);
    return wx;
  } catch (_) {
    return null;
  }
}

/** Current weather where Ewan last was (Open-Meteo, refreshed every 20 minutes). */
export function useWeather(l: Lang): { icon: string; temp: number; label: string } | null {
  const pos = latestPosition.value;
  const [wx, setWx] = useState<Wx | null>(null);
  useEffect(() => {
    if (!pos) return;
    let alive = true;
    getWeather(pos.lat, pos.lng).then((w) => alive && setWx(w));
    return () => { alive = false; };
  }, [pos?.lat.toFixed(2), pos?.lng.toFixed(2), Math.floor(clock.value / (20 * 60_000))]);
  if (!wx) return null;
  const w = weatherLabel(wx.code, l);
  return { icon: w.icon, temp: wx.temp, label: w.label };
}
