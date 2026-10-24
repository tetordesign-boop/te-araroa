import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import { clock, coverOf, dayOnTrail, days, media, mediaByDay, progressKm, route, settings, walked, walkedKm } from "../lib/data";
import { addDays, fmtDate, fmtInt, fmtKm, nzToday, typo } from "../lib/format";
import type { Day } from "../types";
import { dayKm, excerpt, LangSwitch, titleOf } from "./Home";
import { AddSquare, BrandMark, Close, Pencil, Play, Trail } from "./icons";
import { replayIntro } from "./Intro";
import { setSound, soundOn } from "../lib/sound";
import { go, goBack, hrefFor } from "./state";
import { TrailStrip } from "./TrailStrip";

export function PageHead({ title }: { title: string }) {
  return (
    <header class="phead">
      <h1 class="h-page" tabIndex={-1} data-autofocus>{title}</h1>
      <button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={goBack}><Close /></button>
    </header>
  );
}

// ------------------------------------------------------------------ journal: the trail as a spine
function LogItem({ d }: { d: Day }) {
  const l = lang.value;
  const cover = coverOf(d);
  const km = dayKm(d);
  const n = (mediaByDay.value.get(d.id) ?? []).length;
  const ex = excerpt(d, l);
  const meta = [
    d.kind === "rest" ? t("rest") : km ? `${fmtKm(km, l, 1)} km` : null,
    n ? (n === 1 ? t("photoOne") : t("photosN", { n })) : null,
  ].filter(Boolean).join(", ");
  return (
    <li class={`log__item kind-${d.kind}`}>
      <a class="log__link" href={hrefFor({ name: "day", n: d.day_number })}
        onClick={(e) => { e.preventDefault(); go({ name: "day", n: d.day_number }); }}>
        <span class="log__node" aria-hidden="true" />
        <span class="log__text">
          <span class="kicker"><span class="kicker__n">{t("day", { n: d.day_number })}</span><span>{fmtDate(d.date, l, { weekday: "short", day: "numeric", month: "short" })}</span></span>
          <span class="log__title voice">{titleOf(d, l)}</span>
          {ex && <span class="log__excerpt voice">{ex}</span>}
          {meta && <span class="log__meta">{meta}</span>}
        </span>
        {cover && <img class="log__thumb" src={mediaUrl(cover.thumb_path ?? cover.path)} alt="" loading="lazy" decoding="async" />}
      </a>
    </li>
  );
}

export function Journal() {
  const l = lang.value;
  const list = [...days.value].reverse();
  const first = days.value[0];
  const nMedia = media.value.length;
  return (
    <div class="page">
      <PageHead title={t("journal")} />
      {list.length ? (
        <>
          <p class="sub page__sub">
            {t("journalSub", {
              days: list.length === 1 ? t("dayOne") : t("daysN", { n: list.length }),
              km: fmtKm(progressKm.value, l, 0),
              media: nMedia === 1 ? t("mediaOne") : t("mediaN", { n: nMedia }),
            })}
          </p>
          <ol class="log">
            {list.map((d) => <LogItem d={d} />)}
            <li class="log__item log__start">
              <div class="log__link">
                <span class="log__node" aria-hidden="true" />
                <span class="log__text">
                  <span class="log__title voice">{t("startPoint")}</span>
                  {first && <span class="log__meta">{t("startedOn", { date: fmtDate(first.date, l, { day: "numeric", month: "long" }) })}</span>}
                </span>
              </div>
            </li>
          </ol>
        </>
      ) : (
        <p class="empty" style={{ marginTop: "14px" }}>{t("journalEmpty")}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ stats
/**
 * Kilometres per day: one column per day, rest days as dots on the baseline.
 * Mouse: hover shows the day, click opens it. Touch: first tap shows the day, second tap (or the
 * button in the tooltip) opens it. Keyboard: one tab stop, arrows move between days, Enter opens.
 */
function DayBars({ list }: { list: Day[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [sel, setSel] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const pointer = useRef<string>("mouse");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const l = lang.value;
  const H = 132, LEFT = 30, TOP = 16, BOTTOM = 22;
  const kms = list.map((d) => (d.kind === "rest" ? 0 : dayKm(d) ?? 0));
  const max = Math.max(10, ...kms);
  const top = Math.ceil(max / 10) * 10;
  const ticks = [0, top / 2, top];
  const plotW = Math.max(1, w - LEFT);
  const band = plotW / Math.max(1, list.length);
  const bw = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const base = y(0);
  const walking = list.filter((d) => d.kind === "hike" && (dayKm(d) ?? 0) > 0);
  const avg = walking.length ? walking.reduce((s, d) => s + (dayKm(d) ?? 0), 0) / walking.length : 0;
  const maxIdx = kms.indexOf(Math.max(...kms));
  const r = 4;
  const col = (v: number, cx: number) => {
    const x0 = cx - bw / 2, x1 = cx + bw / 2, yt = y(v), rr = Math.min(r, (base - yt) / 2, bw / 2);
    return `M${x0},${base}V${yt + rr}Q${x0},${yt} ${x0 + rr},${yt}H${x1 - rr}Q${x1},${yt} ${x1},${yt + rr}V${base}Z`;
  };
  const hasTransport = list.some((d) => d.kind === "transport");
  const cxOf = (i: number) => LEFT + band * (i + 0.5);
  const idxAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(list.length - 1, Math.floor((clientX - rect.left - LEFT) / band)));
  };
  const openDay = (i: number) => { const d = list[i]; if (d) go({ name: "day", n: d.day_number }); };
  const label = (d: Day) => (d.kind === "rest" ? t("rest") : `${fmtKm(dayKm(d) ?? 0, l, 1)} km`);
  const tipD = sel !== null ? list[sel] : null;
  const half = Math.min(110, w / 2);

  return (
    <div class="bars" ref={ref} style={{ position: "relative" }}
      tabindex={0} role="group" aria-label={`${t("kmPerDay")}. ${t("barsKeys")}`}
      onPointerDown={(e) => { pointer.current = (e as PointerEvent).pointerType || "touch"; }}
      onPointerMove={(e) => { if ((e as PointerEvent).pointerType === "mouse") { setSel(idxAt(e.clientX)); setPinned(false); } }}
      onPointerLeave={(e) => { if ((e as PointerEvent).pointerType === "mouse" && !pinned) setSel(null); }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".bars__tip")) return;
        const i = idxAt(e.clientX);
        if (pointer.current === "mouse" || (pinned && sel === i)) openDay(i);
        else { setSel(i); setPinned(true); }
      }}
      onKeyDown={(e) => {
        const n = list.length;
        if (!n) return;
        const cur = sel ?? n - 1;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          setSel(Math.max(0, Math.min(n - 1, sel === null ? n - 1 : cur + (e.key === "ArrowRight" ? 1 : -1))));
          setPinned(true);
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault(); setSel(e.key === "Home" ? 0 : n - 1); setPinned(true);
        } else if (e.key === "Enter" && sel !== null) {
          e.preventDefault(); openDay(sel);
        } else if (e.key === "Escape") {
          setSel(null); setPinned(false);
        }
      }}
      onBlur={(e) => { if (!ref.current?.contains((e as FocusEvent).relatedTarget as Node)) { setSel(null); setPinned(false); } }}>
      <svg viewBox={`0 0 ${w} ${H}`} height={H} aria-hidden="true">
        {ticks.map((v) => (
          <g>
            <line class="bars__grid" x1={LEFT} x2={w} y1={y(v)} y2={y(v)} />
            <text class="bars__label" x={0} y={y(v) + 4}>{fmtInt(v, l)}</text>
          </g>
        ))}
        {list.map((d, i) => {
          const cx = cxOf(i);
          const v = kms[i];
          return (
            <g class={`bars__col${sel === i ? " is-sel" : ""}`}>
              {d.kind === "rest" || v <= 0
                ? <circle class="bars__rest" cx={cx} cy={base - 5} r={4} />
                : <path class={`bars__bar${d.kind === "transport" ? " is-transport" : ""}`} d={col(v, cx)} style={`--d:${Math.min(i * 12, 480)}ms`} />}
              {i === maxIdx && v > 0 && <text class="bars__label" x={cx} y={y(v) - 5} text-anchor="middle">{fmtKm(v, l, 0)}</text>}
            </g>
          );
        })}
        {avg > 0 && (
          <g pointer-events="none">
            <line class="bars__avg" x1={LEFT} x2={w} y1={y(avg)} y2={y(avg)} />
            <text class="bars__label bars__label--halo" x={w} y={y(avg) - 5} text-anchor="end">{t("avgLine")} {fmtKm(avg, l, 1)} km</text>
          </g>
        )}
        {sel !== null && <line class="bars__cursor" x1={cxOf(sel)} x2={cxOf(sel)} y1={TOP - 6} y2={base} />}
        <text class="bars__label" x={LEFT} y={H - 4}>{t("day", { n: list[0]?.day_number ?? 1 })}</text>
        <text class="bars__label" x={w} y={H - 4} text-anchor="end">{t("day", { n: list[list.length - 1]?.day_number ?? 1 })}</text>
      </svg>
      <div class={`bars__tip glass${tipD ? " is-on" : ""}${pinned ? " is-pinned" : ""}`} role="status"
        style={{ left: `${Math.min(w - half, Math.max(half, sel !== null ? cxOf(sel) : w / 2))}px` }}>
        {tipD && (
          <>
            <strong class="num">{label(tipD)}</strong>
            <span>{t("day", { n: tipD.day_number })}, {titleOf(tipD, l)}</span>
            {pinned && <button class="textbtn" type="button" tabIndex={-1} onClick={() => openDay(sel!)}>{t("openDay")}</button>}
          </>
        )}
      </div>
      <p class="fine" style={{ marginTop: "8px" }}>{t("kmPerDayNote")}{hasTransport ? ` ${t("transportGrey")}` : ""}</p>
    </div>
  );
}

export function Stats() {
  const l = lang.value;
  const ds = days.value;
  const hikeDays = ds.filter((d) => d.kind === "hike" && (dayKm(d) ?? 0) > 0);
  const rest = ds.filter((d) => d.kind === "rest").length;
  const walkedOnFoot = walkedKm.value;
  const prog = progressKm.value;
  const onTrail = dayOnTrail.value ?? ds.length;
  const ascent = ds.reduce((s, d) => s + (d.ascent_m ?? 0), 0);
  const nMedia = media.value.length;
  const longest = hikeDays.reduce<Day | null>((b, d) => (!b || (dayKm(d) ?? 0) > (dayKm(b) ?? 0) ? d : b), null);
  const avg = hikeDays.length ? hikeDays.reduce((s, d) => s + (dayKm(d) ?? 0), 0) / hikeDays.length : 0;
  const total = route.value.total;
  const remaining = Math.max(0, total - prog);
  const pace = onTrail > 0 ? prog / onTrail : 0;
  const today = nzToday(new Date(clock.value));
  const eta = ds.length >= 5 && pace > 1 && remaining > 0.5 ? addDays(today, Math.ceil(remaining / pace)) : null;

  return (
    <div class="page">
      <PageHead title={t("stats")} />
      {!ds.length ? <p class="empty" style={{ marginTop: "14px" }}>{t("statsSoon")}</p> : (
        <>
          <div class="bigline">
            <span class="num bigline__v">{fmtKm(prog, l, 0)}</span>
            <span class="bigline__u">{t("walkedSoFar", { total: fmtKm(total, l, 0) })}</span>
          </div>
          <div style={{ marginTop: "10px" }}>
            <TrailStrip route={route.value} walked={walked.value.hike} here={prog} large />
          </div>

          <dl class="figs">
            <div><dt>{onTrail === 1 ? t("statDayOne") : t("statDays")}</dt><dd class="num">{fmtInt(onTrail, l)}</dd></div>
            <div><dt>{t("statLeft")}</dt><dd class="num">{fmtKm(remaining, l, 0)}<small>km</small></dd></div>
            <div><dt>{t("statAvg")}</dt><dd class="num">{fmtKm(avg, l, 1)}<small>km</small></dd></div>
            <div><dt>{t("statAscent")}</dt><dd class="num">{fmtInt(ascent, l)}<small>m</small></dd></div>
            {longest ? (
              <div class="is-link">
                <dt><a href={hrefFor({ name: "day", n: longest.day_number })} onClick={(e) => { e.preventDefault(); go({ name: "day", n: longest.day_number }); }}>
                  {t("statLongest", { n: longest.day_number })}</a></dt>
                <dd class="num">{fmtKm(dayKm(longest), l, 1)}<small>km</small></dd>
              </div>
            ) : null}
            <div><dt>{rest === 1 ? t("statRestOne") : t("statRest")}</dt><dd class="num">{fmtInt(rest, l)}</dd></div>
            <div><dt>{t("statMedia")}</dt><dd class="num">{fmtInt(nMedia, l)}</dd></div>
            {walkedOnFoot > 0 && Math.abs(walkedOnFoot - prog) > 2 && (
              <div><dt>{l === "fr" ? "à pied" : "on foot"}</dt><dd class="num">{fmtKm(walkedOnFoot, l, 0)}<small>km</small></dd></div>
            )}
          </dl>

          {eta && <p class="eta">{t("etaLine", { date: fmtDate(eta, l, { weekday: "long", day: "numeric", month: "long" }) })}</p>}

          <section class="block">
            <h2 class="h-section" style={{ marginBottom: "12px" }}>{t("kmPerDay")}</h2>
            <DayBars list={ds} />
          </section>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ about
export function About() {
  const l = lang.value;
  const s = settings.value;
  const intro = (l === "en" && s?.intro_en) || s?.intro_fr;
  return (
    <div class="page">
      <PageHead title={t("about")} />
      {intro && <div class="prose voice" style={{ marginTop: "16px" }}>{intro.split(/\n{2,}/).map((p) => <p>{typo(p)}</p>)}</div>}

      <section class="block">
        <h2 class="h-section" style={{ marginBottom: "14px" }}>{t("followTitle")}</h2>
        <ul class="tips">
          <li><span class="tips__icon" aria-hidden="true"><span class="tips__dot" /></span><span>{t("tipLive")}</span></li>
          <li><span class="tips__icon" aria-hidden="true"><Trail /></span><span>{t("tipDay")}</span></li>
          <li><span class="tips__icon" aria-hidden="true"><Pencil /></span><span>{t("tipHut")}</span></li>
          <li><span class="tips__icon" aria-hidden="true"><AddSquare /></span><span>{t("tipHome")}</span></li>
        </ul>
      </section>

      <section class="block">
        <h2 class="h-section" style={{ marginBottom: "12px" }}>{t("language")}</h2>
        <LangSwitch />
        <div class="modes__list" style={{ marginTop: "16px" }}>
          <label class="switchrow">
            <span class="switchrow__text">{t("sounds")}<small>{t("soundsSub")}</small></span>
            <input type="checkbox" role="switch" checked={soundOn.value} onChange={(e) => setSound((e.target as HTMLInputElement).checked)} />
          </label>
        </div>
      </section>

      <button class="btn btn--tint btn--block block" type="button" onClick={replayIntro}>
        <Play />{t("replayIntro")}
      </button>

      {/* the mark explained, once, where people look for that kind of thing */}
      <section class="block logo-note">
        <BrandMark class="logo-note__mark" />
        <div>
          <h2 class="h-section" style={{ fontSize: "17px" }}>{t("logoTitle")}</h2>
          <p class="fine" style={{ marginTop: "6px" }}>{t("logoText")}</p>
        </div>
      </section>

      <section class="block">
        <h2 class="h-section" style={{ fontSize: "17px" }}>{t("credits")}</h2>
        <p class="fine" style={{ marginTop: "6px" }}>{t("creditsText")}</p>
      </section>
    </div>
  );
}
