// "La météo là où je suis": the weather where I am now (at the start, Ship Cove, before I leave), the next days, and
// when a pass is close ahead, the weather up there, corrected for its height. Open-Meteo, refreshed every 20 min.
import { useEffect, useState } from "preact/hooks";
import { lang, t, weatherLabel } from "../i18n";
import { clock, latestPosition, liveState, livePlacement, phase, progressKm, route } from "../lib/data";
import { fmtDate, fmtKm, nzToday } from "../lib/format";
import type { LngLat } from "../lib/geo";
import { nextPlace, places, trailElevation } from "../lib/places";
import { getForecast, type Forecast } from "../lib/weather";
import { placeName } from "./Place";

const r0 = (n: number) => Math.round(n);

function useForecast(c: LngLat | null, elev: number | null): Forecast | null {
  const [f, setF] = useState<Forecast | null>(null);
  const tick = Math.floor(clock.value / (20 * 60_000));
  const key = c ? `${c[0].toFixed(2)},${c[1].toFixed(2)},${elev ?? ""}` : "";
  useEffect(() => {
    if (!c) { setF(null); return; }
    let alive = true;
    getForecast(c[1], c[0], elev).then((x) => alive && setF(x));
    return () => { alive = false; };
  }, [key, tick]);
  return f;
}

export function WeatherCard() {
  const l = lang.value, ph = phase.value, r = route.value;
  if (ph === "after") return null;
  // where: the start before I leave; then my last position (or the end of my last day if it is old)
  let c: LngLat, km: number;
  const live = latestPosition.value, lp = livePlacement.value;
  if (ph === "before") { km = 0; c = r.pointAt(0); }
  else if (live && liveState.value !== "none" && lp?.onTrail) { km = lp.km; c = [live.lng, live.lat]; }
  else { km = progressKm.value; c = r.pointAt(km); }
  const elev = trailElevation(km);
  const f = useForecast(c, elev);
  const { prev, next } = r.around(km);
  const near = Math.abs(prev.km - km) <= Math.abs(next.km - km) ? prev : next;
  const pass = ph === "during" ? nextPlace(km, ["pass"]) : null;
  const passAhead = pass && pass.km - km <= 40 ? pass : null;
  const pf = useForecast(passAhead ? passAhead.c : null, passAhead?.e ?? null);
  if (!f) return null;
  const today = nzToday(new Date(clock.value));
  const w = weatherLabel(f.now.code, l);
  const dayName = (d: string, i: number) => (i === 0 && d === today ? t("wxToday") : i <= 1 && d > today && i === 1 ? t("wxTomorrow") : fmtDate(d, l, { weekday: "long" }));
  // the pass: today until 3 pm, then tomorrow
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Pacific/Auckland", hour: "2-digit", hour12: false }).format(new Date(clock.value)));
  const pd = pf ? pf.days[h < 15 ? 0 : 1] : null;
  return (
    <section class="block wx">
      <div class="block__head">
        <h2 class="h-section">{ph === "before" ? t("wxTitleBefore") : t("wxTitle")}</h2>
      </div>
      <div class="wx__card">
        <p class="wx__where">{ph === "before" ? "Ship Cove" : t("wxNear", { place: near.n.replace(/\s*\(.*\)$/, "") })}{elev !== null ? ` · ${r0(elev).toLocaleString(l === "fr" ? "fr-FR" : "en-NZ")} m` : ""}</p>
        <div class="wx__now">
          <span class="wx__icon" aria-hidden="true">{w.icon}</span>
          <span class="num wx__temp">{r0(f.now.temp)}°</span>
          <span class="wx__side">
            <span class="wx__label">{w.label}</span>
            <span class="wx__meta">{t("wxFeels", { t: r0(f.now.feels) })} · {t("wxWind", { w: r0(f.now.wind), g: r0(f.now.gust) })}</span>
          </span>
        </div>
        <div class="wx__days">
          {f.days.slice(0, 3).map((d, i) => {
            const dw = weatherLabel(d.code, l);
            return (
              <div class="wx__day">
                <span class="wx__dname">{dayName(d.date, i)}</span>
                <span class="wx__dicon" aria-hidden="true">{dw.icon}</span>
                <span class="num wx__range"><b>{r0(d.max)}°</b> {r0(d.min)}°</span>
                <span class="wx__dmeta">{d.rain >= 0.5 ? `${fmtKm(d.rain, l, d.rain < 10 ? 1 : 0)} mm` : t("wxDry")}</span>
                {d.gust >= 50 && <span class="wx__dmeta">{t("wxGustShort", { g: r0(d.gust) })}</span>}
                <span class="sr-only">{dw.label}</span>
              </div>
            );
          })}
        </div>
        {passAhead && pd && (
          <p class="wx__pass">
            {t("wxPass", { name: placeName(passAhead, l), alt: r0(passAhead.e ?? pf!.elevation).toLocaleString(l === "fr" ? "fr-FR" : "en-NZ"), km: fmtKm(passAhead.km - km, l, 0), when: h < 15 ? t("wxTodayLow") : t("wxTomorrowLow") })}
            {" "}<b class="num">{r0(pd.min)}° {t("wxTo")} {r0(pd.max)}°</b>{pd.gust >= 40 ? `, ${t("wxGust", { g: r0(pd.gust) })}` : ""}{pd.rain >= 0.5 ? `, ${fmtKm(pd.rain, l, 1)} mm` : ""}.
          </p>
        )}
      </div>
      <p class="wx__credit"><a href="https://open-meteo.com/" target="_blank" rel="noopener">{t("wxCredit")}</a></p>
    </section>
  );
}
