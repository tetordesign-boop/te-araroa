// The whole trail in 3D: a drone flight along the route, steered from its elevation profile.
// Slide a finger along the profile and the camera travels there; press play and it flies on by itself.
import { signal } from "@preact/signals";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { latestPosition, phase, progressKm, route, walked } from "../lib/data";
import { fmtInt, fmtKm } from "../lib/format";
import { places, profile, shortStation, trailElevation, type Place } from "../lib/places";
import { TrailCam } from "../map/trailcam";
import { Close, Pause, Play } from "./icons";
import { placeName } from "./Place";
import { cameraShow, detent, isDesktop, mapApi, replayState, trailMode } from "./state";

const hud = signal<{ km: number; target: number; playing: boolean } | null>(null);

export function startTrailMode(km: number) {
  const tm = mapApi.value;
  if (!tm) return;
  replayState.value?.stop();
  tm.stopShow();
  cameraShow.value = null;
  if (!isDesktop.value) detent.value = "peek";
  trailMode.value = { startKm: Math.max(0, Math.min(route.value.total, km)) };
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") trailMode.value = null; };
    document.addEventListener("keydown", onKey);
    // start flying on its own after the approach, unless the person grabs the profile first
    const auto = window.setTimeout(() => { if (cam.current === c && !c.playing && Math.abs(c.target - mode.startKm) < 0.01) c.play(); }, 3200);
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

  return (
    <div class="trail-hud glass" ref={card} role="region" aria-label={t("trailModeTitle")}>
      <div class="trail-hud__top">
        <div class="trail-hud__where">
          <span class="trail-hud__name">{where}</span>
          <span class="trail-hud__meta num">
            km {fmtKm(target, l, 0)}{e !== null ? `, ${fmtInt(e, l)} m` : ""}
            {ewan !== null && Math.abs(ewan - target) > 1 ? <span class="trail-hud__ewan">, {t(target < ewan ? "kmBehindEwan" : "kmAheadEwan", { km: fmtKm(Math.abs(ewan - target), l, 0) })}</span> : null}
          </span>
        </div>
        <button class={`trail-hud__play${playing ? " is-playing" : ""}`} type="button" onClick={toggle} aria-label={playing ? t("pause") : t("play")}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button class="iconbtn" type="button" aria-label={t("closeFlyover")} onClick={() => (trailMode.value = null)}><Close /></button>
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
  );
}
