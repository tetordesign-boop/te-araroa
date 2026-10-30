import { mediaUrl } from "../config";
import { hikerName, lang, setLang, t, type Key } from "../i18n";
import {
  clock, coverOf, dayOnTrail, dayTitle, days, latestPosition, livePlacement, liveState, mediaByDay,
  phase, progressKm, route, settings, walked,
} from "../lib/data";
import { addDays, daysBetween, fmtDate, fmtInt, fmtKm, nzHour, nzTime, nzToday, relTimeShort, typo } from "../lib/format";
import { nextPlace, places, type Place } from "../lib/places";
import type { Day, Lang } from "../types";
import { startEyeView } from "./eye";
import { openSearch } from "./Explore";
import { NoteToEwan } from "./NoteToEwan";
import { ChevronRight, Eye, Play, Search, Trail } from "./icons";
import { altText, openPlace, PlaceBadge, placeName } from "./Place";
import { arrival, go, hrefFor, isDesktop } from "./state";
import { startTrailMode } from "./TrailMode";
import { shortPlace, TrailStrip } from "./TrailStrip";
import { useWeather } from "./WeatherClock";

// ------------------------------------------------------------------ helpers shared with the other views
export const dayKm = (d: Day) => d.distance_km ?? (d.start_km !== null && d.end_km !== null ? d.end_km - d.start_km : null);

/** "aujourd'hui", "hier", or the date. */
export function dayWhen(date: string, l: Lang, today: string): string {
  if (date === today) return t("today");
  if (date === addDays(today, -1)) return t("yesterday");
  return fmtDate(date, l);
}

/** First paragraph of the story, in the reader's language when Ewan wrote one. */
export function excerpt(d: Day, l: Lang): string | null {
  const s = (l === "en" && d.story_en) || d.story;
  return s ? typo(s.split(/\n{2,}/)[0].trim()) : null;
}

export function titleOf(d: Day, l: Lang): string {
  return typo(dayTitle(d, l) || (d.kind === "rest" ? t("rest") : t("noTitle", { n: d.day_number })));
}

const open = (d: Day) => (e: Event) => { e.preventDefault(); go({ name: "day", n: d.day_number }); };

// ------------------------------------------------------------------ where is Ewan
function Status() {
  const p = latestPosition.value;
  const state = liveState.value;
  const l = lang.value;
  clock.value; // re-render on clock ticks
  if (!p) return null;
  const lp = livePlacement.value;
  let where = "";
  if (lp?.onTrail) {
    const { prev, next } = route.value.around(lp.km);
    const near = Math.abs(lp.km - prev.km) <= Math.abs(next.km - lp.km) ? prev : next;
    if (Math.abs(near.km - lp.km) < 25) where = t("near", { place: shortPlace(near.n) });
  }
  return (
    <div class={`status${state === "stale" ? " is-stale" : ""}`}>
      <span class="status__dot" aria-hidden="true" />
      <span class="status__text">
        <strong>{state === "live" ? t("live") : t("lastKnown")}</strong>{where ? `, ${where}` : ""}
      </span>
      <span class="status__side"><span class="muted">{relTimeShort(p.recorded_at, l)}</span></span>
    </div>
  );
}

/** Weather where he is and the time in New Zealand, said in a sentence. */
function Conditions() {
  const l = lang.value;
  const wx = useWeather(l);
  const now = new Date(clock.value);
  const h = nzHour(now);
  const night = h >= 21 || h < 6;
  const time = nzTime(l, now);
  return (
    <p class="conditions">
      {wx ? `${t("wxLine", { icon: wx.icon, temp: wx.temp, label: wx.label })} ` : ""}
      {night ? t("timeNight", { time, name: hikerName.value }) : t("timeDay", { time })}
    </p>
  );
}

/** Walked ranges cut at a km (the strip follows the map while the trail draws itself). */
const upTo = (ranges: [number, number][], max: number): [number, number][] =>
  ranges.flatMap(([a, b]): [number, number][] => (a >= max ? [] : [[a, Math.min(b, max)]]));

function Now() {
  const l = lang.value;
  const r = route.value;
  const km = progressKm.value;
  const ph = phase.value;
  const n = dayOnTrail.value;
  // the arrival: the kilometres count up with the trail drawing itself on the map
  const a = arrival.value;
  const shown = a === null ? km : km * a;
  return (
    <section class="now" aria-label={t("whereNow")}>
      <Status />
      <div class="now__row">
        <div class="now__km">
          {/* past 1 000 km the number gets narrower (by the final figure: no jump while it counts up) */}
          <span class={`num now__big${km >= 999.5 ? " is-long" : ""}`} aria-hidden={a !== null}>{fmtKm(shown, l, 0)}</span>
          {a !== null && <span class="sr-only">{fmtKm(km, l, 0)}</span>}
          <span class="now__unit">km</span>
        </div>
        <div class="now__side">
          {/* at the end: how long it took, short enough to sit beside the four digits */}
          {n ? <span class="now__day">{ph === "after" ? t("daysTotal", { n }) : t("day", { n })}</span> : null}
          <span class="now__of">{ph === "after" ? t("toBluff") : t("ofTotal", { total: fmtKm(r.total, l, 0) })}</span>
        </div>
      </div>
      <TrailStrip route={r} walked={a === null ? walked.value.hike : upTo(walked.value.hike, shown)} here={shown} legendAt={km} />
      {latestPosition.value && <Conditions />}
      <Actions />
    </section>
  );
}

/** The two ways to feel the trail: Ewan's own view right now, and the whole trail from the air. */
function Actions() {
  const ph = phase.value;
  const eye = !!latestPosition.value && ph !== "before";
  return (
    <div class="actions actions--home" data-needs-map>
      {eye && <button class="action" type="button" data-sfx="whoosh" onClick={startEyeView}><Eye />{t("seeWhatHeSees")}</button>}
      <button class="action" type="button" data-sfx="whoosh" onClick={() => startTrailMode(ph === "before" ? 0 : progressKm.value)}><Play />{t("flyover")}</button>
    </div>
  );
}

/** Next hut, next pass, next town (and the next road or boat crossing when it's close). */
function OnHisWay() {
  const l = lang.value;
  const ph = phase.value;
  const list = places.value;
  if (ph === "after" || !list.length) return null;
  const from = ph === "before" ? 0 : progressKm.value;
  const picks: [Key, Place | null][] = [
    ["nextHut", nextPlace(from, ["hut"], list)],
    ["nextPass", nextPlace(from, ["pass"], list)],
    ["nextTown", nextPlace(from, ["town"], list)],
  ];
  const gap = nextPlace(from, ["gap"], list);
  if (gap && gap.km - from < 150) picks.push(["nextTransfer", gap]);
  const items = picks.filter((x): x is [Key, Place] => !!x[1]).sort((a, b) => a[1].km - b[1].km);
  if (!items.length) return null;
  return (
    <section class="block">
      <div class="block__head">
        <h2 class="h-section">{ph === "before" ? t("onTheWayBefore") : t("onHisWay")}</h2>
        <a class="link" href="#/explorer" onClick={(e) => { e.preventDefault(); go({ name: "explore" }); }}>{t("exploreLink")}</a>
      </div>
      <div class="hscroll nexts" role="list">
        {items.map(([key, p]) => {
          const alt = altText(p, l);
          const dist = p.km - from;
          return (
            <a role="listitem" class="next" href={`#/lieu/${encodeURIComponent(p.id)}`} onClick={(e) => { e.preventDefault(); openPlace(p.id); }}>
              <span class="next__top"><PlaceBadge kind={p.t} size={24} /><span class="next__label">{t(key)}</span></span>
              <span class="next__name">{placeName(p, l)}</span>
              <span class="next__meta num">{ph === "before" ? `km ${fmtKm(p.km, l, p.km < 10 ? 1 : 0)}` : t("inKm", { km: fmtKm(dist, l, dist < 10 ? 1 : 0) })}{alt ? `, ${alt}` : ""}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function Before() {
  const l = lang.value;
  const s = settings.value;
  const today = nzToday(new Date(clock.value));
  const n = s?.start_date ? daysBetween(today, s.start_date) : null;
  const date = s?.start_date ? fmtDate(s.start_date, l, { day: "numeric", month: "long" }) : null;
  return (
    <section class="now">
      {n !== null && n > 0 ? (
        <div class="now__row" style={{ marginTop: "2px" }}>
          <div class="now__km"><span class="num now__big">{n}</span><span class="now__unit">{n === 1 ? t("dayUnit") : t("daysUnit")}</span></div>
          <div class="now__side">
            <span class="now__day">{t("beforeStart")}</span>
            <span class="now__of">{date}</span>
          </div>
        </div>
      ) : <h2 class="before__big">{n === 0 ? t("countdownToday") : t("notStarted")}</h2>}
      <TrailStrip route={route.value} walked={[]} here={null} />
      {date && <p class="conditions">{t("startsOn", { date })}</p>}
      <Actions />
    </section>
  );
}

// ------------------------------------------------------------------ the latest day, as a cover story
function Feature({ d }: { d: Day }) {
  const l = lang.value;
  const cover = coverOf(d);
  const n = (mediaByDay.value.get(d.id) ?? []).length;
  const today = nzToday(new Date(clock.value));
  const km = dayKm(d);
  const ex = excerpt(d, l);
  const src = cover ? mediaUrl(cover.kind === "photo" ? cover.path : cover.thumb_path ?? cover.path) : null;
  return (
    <a class="feature" href={hrefFor({ name: "day", n: d.day_number })} onClick={open(d)}>
      {src && (
        <div class="feature__img">
          <img src={src} alt="" loading="lazy" decoding="async" />
          {n > 1 && <span class="feature__count">{t("photosN", { n })}</span>}
        </div>
      )}
      <div class="feature__body">
        <div class="kicker"><span class="kicker__n">{t("day", { n: d.day_number })}</span><span>{dayWhen(d.date, l, today)}</span></div>
        <h2 class="feature__title voice">{titleOf(d, l)}</h2>
        {ex && <p class="feature__excerpt voice">{ex}</p>}
        {d.kind === "rest" ? <p class="feature__meta">{t("rest")}</p> : km ? (
          <p class="feature__meta">
            <span class="num">{fmtKm(km, l, 1)} km</span>
            {d.ascent_m ? `, ${t("climbM", { m: fmtInt(d.ascent_m, l) })}` : ""}
          </p>
        ) : null}
      </div>
    </a>
  );
}

export function DayRow({ d }: { d: Day }) {
  const l = lang.value;
  const cover = coverOf(d);
  const km = dayKm(d);
  return (
    <a class="row" href={hrefFor({ name: "day", n: d.day_number })} onClick={open(d)}>
      {cover
        ? <img class="row__thumb" src={mediaUrl(cover.thumb_path ?? cover.path)} alt="" loading="lazy" decoding="async" />
        : <span class="row__thumb row__thumb--empty" aria-hidden="true"><Trail /></span>}
      <span class="row__main">
        <span class="row__title voice">{titleOf(d, l)}</span>
        <span class="row__meta">
          {t("day", { n: d.day_number })}, {fmtDate(d.date, l, { day: "numeric", month: "short" })}
          {d.kind === "rest" ? `, ${t("rest").toLowerCase()}` : km ? <>, <span class="num">{fmtKm(km, l, 1)} km</span></> : null}
        </span>
      </span>
      <ChevronRight class="row__chev" />
    </a>
  );
}

export function LangSwitch() {
  const l = lang.value;
  return (
    <div class="seg" role="group" aria-label={t("language")}>
      <button type="button" lang="fr" aria-pressed={l === "fr"} onClick={() => setLang("fr")}>Français</button>
      <button type="button" lang="en" aria-pressed={l === "en"} onClick={() => setLang("en")}>English</button>
    </div>
  );
}

function Footer() {
  return (
    <footer class="foot">
      {/* (the journal, the explorer and the stats are in the navigation at the bottom) */}
      <nav class="foot__links">
        <a href="#/apropos" onClick={(e) => { e.preventDefault(); go({ name: "about" }); }}>{t("about")}</a>
      </nav>
      <LangSwitch />
    </footer>
  );
}

export function Home() {
  const l = lang.value;
  const s = settings.value;
  const ph = phase.value;
  const list = days.value;
  const latest = list[list.length - 1] ?? null;
  const earlier = list.slice(-4, -1).reverse();
  const intro = (l === "en" && s?.intro_en) || s?.intro_fr;

  return (
    <div class="home">
      {isDesktop.value && (
        <button class="searchbtn" type="button" onClick={openSearch}><Search />{t("searchPlaceholder")}</button>
      )}
      {ph === "before" ? <Before /> : <Now />}

      {ph === "before" && intro && (
        <div class="prose voice block">{intro.split(/\n{2,}/).map((p) => <p>{typo(p)}</p>)}</div>
      )}

      {latest && <Feature d={latest} />}

      <OnHisWay />

      {earlier.length > 0 && (
        <section class="block">
          <div class="block__head">
            <h2 class="h-section">{t("earlierDays")}</h2>
            <a class="link" href="#/journal" onClick={(e) => { e.preventDefault(); go({ name: "journal" }); }}>{t("fullJournal")}</a>
          </div>
          <div class="rows">{earlier.map((d) => <DayRow d={d} />)}</div>
        </section>
      )}

      <div class="block"><NoteToEwan dayId={null} /></div>
      <Footer />
    </div>
  );
}
