// The whole trail in 3D: a drone flight along the route, steered from its elevation profile.
// Slide a finger along the profile and the camera travels there; press play and it flies on by itself.
import { signal } from "@preact/signals";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { computed } from "@preact/signals";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import { days, latestPosition, livePlacement, media, mediaPositions, phase, progressKm, route, walked } from "../lib/data";
import { fmtInt, fmtKm } from "../lib/format";
import type { LngLat } from "../lib/geo";
import type { Day, Media } from "../types";
import { TrailSketch } from "./TrailSketch";
import { titleOf } from "./Home";
import { places, profile, shortStation, trailElevation, type Place } from "../lib/places";
import { TrailCam } from "../map/trailcam";
import { Close, Pause, Play } from "./icons";
import { placeName } from "./Place";
import { cameraShow, closeTrailMode, detent, go, isDesktop, mapApi, pushFlyoverHash, replayState, trailMode } from "./state";

const hud = signal<{ km: number; target: number; playing: boolean } | null>(null);

export function startTrailMode(km: number) {
  const tm = mapApi.value;
  if (!tm) return;
  replayState.value?.stop();
  tm.stopShow();
  cameraShow.value = null;
  if (!isDesktop.value) detent.value = "peek";
  const k = Math.max(0, Math.min(route.value.total, km));
  pushFlyoverHash(k);
  trailMode.value = { startKm: k };
}

/** Ewan's photos placed along the trail (km), for the flyover to show them as it passes. */
const photosAlong = computed(() => {
  const r = route.value;
  const pos = mediaPositions.value;
  const byDay = new Map(days.value.map((d) => [d.id, d]));
  const out: { km: number; m: Media; day: Day }[] = [];
  for (const m of media.value) {
    const c = pos.get(m.id);
    const day = byDay.get(m.day_id);
    if (!c || !day || m.kind === "embed") continue;
    const snap = r.nearest(c);
    if (snap.dist < 3000) out.push({ km: snap.km, m, day });
  }
  return out.sort((a, b) => a.km - b.km);
});

/** The day Ewan walked a km on (the latest, if he went through twice). */
function dayAt(km: number): Day | null {
  let found: Day | null = null;
  for (const d of days.value) {
    if (d.kind === "rest" || d.start_km === null || d.end_km === null) continue;
    if (km >= Math.min(d.start_km, d.end_km) && km <= Math.max(d.start_km, d.end_km)) found = d;
  }
  return found;
}

const TOWNS = new Set(["Havelock", "St Arnaud", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Wānaka", "Queenstown", "Invercargill"]);
const LABEL_KINDS = new Set(["town", "hut", "pass", "gap", "camp", "fall"]);

/** What to call a km of the trail: a place within reach, or "between X and Y". */
function whereAt(km: number, list: Place[], l: "fr" | "en"): string {
  let best: Place | null = null;
  for (const p of list) {
    if (!LABEL_KINDS.has(p.t)) continue;
    const d = Math.abs(p.km - km);
    if (d < 1.2 && (!best || d < Math.abs(best.km - km))) best = p;
  }
  if (best) return placeName(best, l);
  const { prev, next } = route.value.around(km);
  if (prev.n === next.n) return shortStation(prev.n);
  return t("between", { a: shortStation(prev.n), b: shortStation(next.n) });
}

function Profile({ w, h, target, onScrub, onEnd }: { w: number; h: number; target: number; onScrub: (km: number) => void; onEnd: () => void }) {
  const p = profile.value;
  const r = route.value;
  const total = r.total;
  const TOP = 6, BOT = 3;
  const maxE = Math.max(1000, Math.ceil(((p?.max ?? 2000) + 50) / 500) * 500);
  const x = (km: number) => (km / total) * w;
  const y = (e: number) => TOP + (1 - e / maxE) * (h - TOP - BOT);
  const { area, line } = useMemo(() => {
    if (!p) return { area: "", line: "" };
    const cols = Math.max(40, Math.round(w));
    const per = p.e.length / cols;
    const pts: string[] = [];
    for (let i = 0; i < cols; i++) {
      let m = 0;
      for (let j = Math.floor(i * per); j < Math.min(p.e.length, Math.floor((i + 1) * per) + 1); j++) m = Math.max(m, p.e[j]);
      pts.push(`${((i + 0.5) / cols * w).toFixed(1)},${y(m).toFixed(1)}`);
    }
    const ln = `M0,${pts[0].split(",")[1]}L${pts.join("L")}L${w},${pts[pts.length - 1].split(",")[1]}`;
    return { line: ln, area: `${ln}L${w},${h}L0,${h}Z` };
  }, [p, w, h]);
  const drag = useRef(false);
  const ref = useRef<SVGSVGElement>(null);
  const kmAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total));
  };
  const walkedRanges = walked.value.hike;
  const here = phase.value === "before" ? null : progressKm.value;
  const e = trailElevation(target) ?? 0;
  const towns = r.places().filter((pl) => TOWNS.has(pl.n));

  return (
    <svg ref={ref} class="tprof" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true"
      onPointerDown={(ev) => { drag.current = true; (ev.currentTarget as Element).setPointerCapture((ev as PointerEvent).pointerId); onScrub(kmAt(ev.clientX)); }}
      onPointerMove={(ev) => { if (drag.current) onScrub(kmAt(ev.clientX)); }}
      onPointerUp={() => { drag.current = false; onEnd(); }}
      onPointerCancel={() => { drag.current = false; onEnd(); }}>
      <defs>
        <clipPath id="tprof-walked">{walkedRanges.map(([a, b]) => <rect x={x(a)} y={0} width={Math.max(0.5, x(b) - x(a))} height={h} />)}</clipPath>
        <linearGradient id="tprof-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--marker)", stopOpacity: 0.42 }} />
          <stop offset="1" style={{ stopColor: "var(--marker)", stopOpacity: 0.08 }} />
        </linearGradient>
      </defs>
      <path class="tprof__area" d={area} />
      <path class="tprof__line" d={line} />
      <g clip-path="url(#tprof-walked)">
        <path d={area} fill="url(#tprof-fill)" />
        <path class="tprof__line tprof__line--walked" d={line} />
      </g>
      {r.trail.gaps.map((g) => <line class="tprof__gap" x1={x(g.km)} x2={x(g.km)} y1={h - 16} y2={h} />)}
      {towns.map((tw) => <line class="tprof__town" x1={x(tw.km)} x2={x(tw.km)} y1={h - 5} y2={h} />)}
      {here !== null && <circle class="tprof__here" cx={x(here)} cy={y(trailElevation(here) ?? 0)} r={4.5} />}
      <line class="tprof__cursor" x1={x(target)} x2={x(target)} y1={0} y2={h} />
      <circle class="tprof__knob" cx={x(target)} cy={y(e)} r={6} />
    </svg>
  );
}

export function TrailMode() {
  const l = lang.value;
  const mode = trailMode.value;
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cam = useRef<TrailCam | null>(null);
  const [w, setW] = useState(340);
  const H = isDesktop.value ? 96 : 78;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the camera lives as long as the mode
  useEffect(() => {
    const tm = mapApi.value;
    if (!tm || !mode) return;
    document.documentElement.classList.add("is-trail-mode");
    const pad = () => ({ top: 70, left: 30, right: 30, bottom: (card.current?.offsetHeight ?? 160) + 28 });
    const c = new TrailCam(tm, route.peek(), mode.startKm, pad(), () => {
      hud.value = { km: c.km, target: c.target, playing: c.playing };
    });
    cam.current = c;
    hud.value = { km: c.km, target: c.target, playing: false };
    const onResize = () => c.setPadding(pad());
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeTrailMode(); };
    document.addEventListener("keydown", onKey);
    // start flying on its own after the approach, unless the person took the profile or the map first
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const auto = still ? 0 : window.setTimeout(() => { if (cam.current === c && !c.playing && !c.grabbed && Math.abs(c.target - mode.startKm) < 0.01) c.play(); }, 3200);
    // keyboard and screen readers: into the flyover, and back where they were afterwards
    const before = document.activeElement as HTMLElement | null;
    card.current?.querySelector<HTMLElement>(".trail-hud__profile")?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    return () => {
      clearTimeout(auto);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      const km = c.km;
      c.destroy();
      cam.current = null;
      hud.value = null;
      document.documentElement.classList.remove("is-trail-mode");
      tm.map.flyTo({ center: route.peek().pointAt(km), zoom: 10.4, pitch: 50, padding: tm.viewPadding, duration: 1600, essential: true });
      requestAnimationFrame(() => { if (before?.isConnected) before.focus({ preventScroll: true }); });
    };
  }, [mode?.startKm]);

  const s = hud.value;
  const target = s?.target ?? mode?.startKm ?? 0;
  const list = places.value;
  const where = whereAt(target, list, l);
  const e = trailElevation(target);
  const playing = !!s?.playing;
  const total = route.value.total;
  const toggle = () => { const c = cam.current; if (!c) return; if (c.playing) c.pause(); else c.play(); };
  const scrub = (km: number) => { const c = cam.current; if (!c) return; c.pause(); c.scrubTo(km); };
  const ewan = latestPosition.value && phase.value !== "before" ? progressKm.value : null;
  const day = dayAt(target);
  // the photo taken closest to where the camera is, within a couple of km
  let photo: { km: number; m: Media; day: Day } | null = null;
  for (const x of photosAlong.value) {
    const d = Math.abs(x.km - target);
    if (d < 1.5 && (!photo || d < Math.abs(photo.km - target))) photo = x;
  }
  const openPhoto = () => {
    if (!photo) return;
    const { m, day: pd } = photo;
    trailMode.value = null;
    // the flyover's address gives way to the day's (back then returns to where the flyover started)
    go({ name: "day", n: pd.day_number, photo: m.id }, { replace: true });
  };

  // the little map of the whole island: where the flight is, the way so far, where Ewan is (a touch flies there)
  const at = s?.km ?? target;
  const lp = livePlacement.value;
  const pos = latestPosition.value;
  const ewanAt: LngLat | null = phase.value === "before" ? null : lp?.onTrail ? lp.point : pos ? [pos.lng, pos.lat] : null;
  const [mw, mh] = isDesktop.value ? [150, 180] : [100, 122];

  return (
    <>
    <div class="fly-mini glass" aria-hidden="true">
      <TrailSketch route={route.value} width={mw} height={mh} walked={walked.value.hike} flownTo={at} point={at} ewan={ewanAt} onPick={scrub} />
    </div>
    <div class="trail-hud glass" ref={card} role="region" aria-label={t("trailModeTitle")}>
      <div class="trail-hud__top">
        {photo && (
          <button class="trail-hud__photo" type="button" key={photo.m.id} onClick={openPhoto}
            aria-label={`${t("day", { n: photo.day.day_number })}, ${t("photoBy")}`}>
            <img src={mediaUrl(photo.m.thumb_path ?? photo.m.path)} alt="" decoding="async" />
          </button>
        )}
        <div class="trail-hud__where">
          <span class="trail-hud__name">{where}</span>
          <span class="trail-hud__meta num">
            km {fmtKm(target, l, 0)}{e !== null ? `, ${fmtInt(e, l)} m` : ""}
            {/* where Ewan walked, the day says it better than a distance */}
            {!day && ewan !== null && Math.abs(ewan - target) > 1 ? <span class="trail-hud__ewan">, {t(target < ewan ? "kmBehindEwan" : "kmAheadEwan", { km: fmtKm(Math.abs(ewan - target), l, 0) })}</span> : null}
          </span>
          {day && <span class="trail-hud__day"><span class="kicker__n">{t("day", { n: day.day_number })}</span> <span class="voice">{titleOf(day, l)}</span></span>}
        </div>
        <button class={`trail-hud__play${playing ? " is-playing" : ""}`} type="button" onClick={toggle} aria-label={playing ? t("pause") : t("play")}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button class="iconbtn" type="button" data-sfx="close" aria-label={t("closeFlyover")} onClick={closeTrailMode}><Close /></button>
      </div>
      <div class="trail-hud__profile" ref={wrap}
        role="slider" tabIndex={0} aria-label={t("profileLabel")}
        aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(target)}
        aria-valuetext={`km ${fmtKm(target, l, 0)}, ${where}${e !== null ? `, ${fmtInt(e, l)} m` : ""}`}
        onKeyDown={(ev) => {
          const step = ev.shiftKey ? 10 : 1;
          if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); scrub(target + step); }
          else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); scrub(target - step); }
          else if (ev.key === "PageUp") { ev.preventDefault(); scrub(target + 25); }
          else if (ev.key === "PageDown") { ev.preventDefault(); scrub(target - 25); }
          else if (ev.key === "Home") { ev.preventDefault(); scrub(0); }
          else if (ev.key === "End") { ev.preventDefault(); scrub(total); }
          else if (ev.key === " ") { ev.preventDefault(); toggle(); }
        }}>
        <Profile w={w} h={H} target={target} onScrub={scrub} onEnd={() => {}} />
      </div>
      <div class="trail-hud__axis">
        <span>Ship Cove</span>
        <span class="trail-hud__hint">{t("scrubHint")}</span>
        <span>Bluff</span>
      </div>
    </div>
    </>
  );
}
