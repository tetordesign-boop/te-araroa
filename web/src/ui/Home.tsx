import { lang, t } from "../i18n";
import {
  coverOf, dayOnTrail, dayTitle, days, latestPosition, livePlacement, liveState, mediaByDay,
  phase, progressKm, route, settings, walked, clock,
} from "../lib/data";
import { daysBetween, fmtDate, fmtKm, nzHour, nzTime, nzToday, relTime } from "../lib/format";
import { mediaUrl } from "../config";
import type { Day } from "../types";
import { HutBook } from "./HutBook";
import { ChevronRight } from "./icons";
import { go, hrefFor } from "./state";
import { shortPlace, TrailStrip } from "./TrailStrip";
import { WeatherClock } from "./WeatherClock";

export function Status() {
  const p = latestPosition.value;
  const state = liveState.value;
  const l = lang.value;
  if (!p) return null;
  const lp = livePlacement.value;
  let where = "";
  if (lp?.onTrail) {
    const { prev, next } = route.value.around(lp.km);
    const near = Math.abs(lp.km - prev.km) <= Math.abs(next.km - lp.km) ? prev : next;
    if (Math.abs(near.km - lp.km) < 25) where = t("near", { place: shortPlace(near.n) });
  }
  const now = new Date(clock.value); // re-render on clock ticks
  const h = nzHour(now);
  return (
    <div class={`status${state === "stale" ? " is-stale" : ""}`}>
      <span class="status__dot" aria-hidden="true" />
      <span class="status__text">
        <strong>{state === "live" ? t("live") : t("lastKnown")}</strong>{" "}
        {relTime(p.recorded_at, l)}{where ? `, ${where}` : ""}
      </span>
      <span class="status__clock num" title={t("nzTime", { time: nzTime(l, now) })}>
        <span aria-hidden="true">{h >= 21 || h < 6 ? "🌙" : "🕒"}</span>
        <span class="sr-only">{t("nzTime", { time: "" })}</span>{nzTime(l, now)}
      </span>
    </div>
  );
}

export function DayRow({ d, large }: { d: Day; large?: boolean }) {
  const l = lang.value;
  const cover = coverOf(d);
  const n = (mediaByDay.value.get(d.id) ?? []).length;
  const km = d.distance_km ?? (d.start_km !== null && d.end_km !== null ? d.end_km - d.start_km : null);
  const title = dayTitle(d, l) || t("day", { n: d.day_number });
  return (
    <a class={`row${large ? " journal-row" : ""}`} href={hrefFor({ name: "day", n: d.day_number })}
      onClick={(e) => { e.preventDefault(); go({ name: "day", n: d.day_number }); }}>
      {cover
        ? <img class="row__thumb" src={mediaUrl(cover.thumb_path ?? cover.path)} alt="" loading="lazy" decoding="async" />
        : <span class="row__thumb row__thumb--empty" aria-hidden="true">{d.kind === "rest" ? "☕" : "⛰"}</span>}
      <span class="row__main">
        <span class="row__title" style={{ display: "block" }}>{title}</span>
        <span class="row__meta" style={{ display: "block" }}>
          {t("day", { n: d.day_number })}, {fmtDate(d.date, l, { day: "numeric", month: "short" })}
          {d.kind === "rest" ? `, ${t("rest").toLowerCase()}` : km ? <>, <span class="num">{fmtKm(km, l)} km</span></> : null}
          {large && n > 0 ? `, ${n === 1 ? t("photoOne") : t("photosN", { n })}` : null}
        </span>
      </span>
      <ChevronRight class="row__chev" width={18} height={18} />
    </a>
  );
}

export function Home() {
  const l = lang.value;
  const s = settings.value;
  const ph = phase.value;
  const r = route.value;
  const km = progressKm.value;
  const latest = days.value.slice(-3).reverse();
  const today = nzToday(new Date(clock.value));

  return (
    <div class="home">
      {ph === "before" ? (
        <div class="countdown">
          {s?.start_date ? (() => {
            const n = daysBetween(today, s.start_date);
            return (
              <>
                <div class="countdown__big">{n > 1 ? t("countdown", { n }) : n === 1 ? t("countdownOne") : t("countdownToday")}</div>
                <p class="countdown__text">{t("startsOn", { date: fmtDate(s.start_date, l, { day: "numeric", month: "long" }) })}</p>
              </>
            );
          })() : <div class="countdown__big">{t("notStarted")}</div>}
          <TrailStrip route={r} walked={[]} here={null} />
        </div>
      ) : (
        <>
          <Status />
          <div class="progress">
            <div class="progress__row">
              <span class="progress__km num">{fmtKm(km, l, 0)}</span>
              <span class="progress__label">{t("walkedOf", { total: fmtKm(r.total, l, 0) })}</span>
              {dayOnTrail.value && <span class="progress__day">{ph === "after" ? t("finished", { n: dayOnTrail.value }) : t("day", { n: dayOnTrail.value })}</span>}
            </div>
            <TrailStrip route={r} walked={walked.value.hike} here={km} />
          </div>
          {latestPosition.value && <WeatherClock />}
        </>
      )}

      {ph === "before" && (s?.intro_fr || s?.intro_en) && (
        <div class="section">
          <div class="prose voice">{(l === "en" && s?.intro_en) || s?.intro_fr}</div>
        </div>
      )}

      {latest.length > 0 && (
        <div class="section">
          <div class="section__head">
            <h2 class="section__title">{t("latestDays")}</h2>
            <a class="link" href="#/journal" onClick={(e) => { e.preventDefault(); go({ name: "journal" }); }}>{t("fullJournal")}</a>
          </div>
          <div class="list">{latest.map((d) => <DayRow d={d} />)}</div>
        </div>
      )}

      <div class="section">
        <div class="list">
          <a class="row row--plain" style={{ minHeight: "52px" }} href="#/stats" onClick={(e) => { e.preventDefault(); go({ name: "stats" }); }}>
            <span class="row__main"><span class="row__title" style={{ display: "block" }}>{t("stats")}</span></span>
            <ChevronRight class="row__chev" width={18} height={18} />
          </a>
          <a class="row row--plain" style={{ minHeight: "52px" }} href="#/apropos" onClick={(e) => { e.preventDefault(); go({ name: "about" }); }}>
            <span class="row__main"><span class="row__title" style={{ display: "block" }}>{t("about")}</span></span>
            <ChevronRight class="row__chev" width={18} height={18} />
          </a>
        </div>
      </div>

      <HutBook dayId={null} />
    </div>
  );
}
