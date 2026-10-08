import { NZ_TZ } from "../config";
import type { Lang } from "../types";

const locale = (lang: Lang) => (lang === "fr" ? "fr-FR" : "en-NZ");

export function fmtKm(km: number | null | undefined, lang: Lang, digits?: number): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return "–";
  const d = digits ?? (km < 10 ? 1 : 0);
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(km);
}

export function fmtInt(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(n);
}

/** "2026-12-09" → Date at local noon (avoids TZ drift for pure dates). */
export function dateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function fmtDate(s: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return new Intl.DateTimeFormat(locale(lang), { ...opts, timeZone: "UTC" }).format(dateOnly(s));
}

export function fmtShortDate(s: string, lang: Lang): string {
  return fmtDate(s, lang, { day: "numeric", month: "short" });
}

/** Today's date in New Zealand, as YYYY-MM-DD. */
export function nzToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: NZ_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nzTime(lang: Lang, now = new Date()): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: NZ_TZ, hour: "2-digit", minute: "2-digit" }).format(now);
}

export function nzHour(now = new Date()): number {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: NZ_TZ, hour: "2-digit", hour12: false }).format(now), 10) % 24;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / 86400000);
}

export function addDays(s: string, n: number): string {
  const d = dateOnly(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function relTime(iso: string, lang: Lang, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (min < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  return rtf.format(-d, "day");
}

export function fmtDuration(min: number | null | undefined, lang: Lang): string {
  if (!min) return "–";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

export function plural(n: number, one: string, many: string): string {
  return Math.abs(n) >= 2 ? many : one;
}
