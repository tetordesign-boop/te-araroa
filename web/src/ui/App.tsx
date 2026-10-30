import { computed, effect, signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { OFFLINE_MAP } from "../config";
import { hikerName, lang, t } from "../i18n";
import {
  dayByNumber, days, latestDay, latestPosition, liveState, media, mediaPositions, phase, positions,
  progressKm, route, settings, status, walked, offline,
} from "../lib/data";
import { relTime } from "../lib/format";
import type { LngLat } from "../lib/geo";
import { mapPois, placeById, places, poiGroups, searchPlaces } from "../lib/places";
import { play } from "../lib/sound";
import { TrailMap, type LiveData, type MapData } from "../map/map";
import { DayView } from "./DayView";
import { ExploreView, openSearch } from "./Explore";
import { endEyeView, startEyeView } from "./eye";
import { Home } from "./Home";
import { dayKm } from "./Home";
import { BrandMark, Close, Compass, Eye, Locate, MapIcon, Orbit, Replay, Search } from "./icons";
import { MapFallback } from "./MapFallback";
import { MapModes, mapPrefs, modesClosedAt, modesOpen } from "./MapModes";
import { About, Journal, Stats } from "./Pages";
import { PlaceView, placeName } from "./Place";
import { startReplay } from "./replayControl";
import { Sheet } from "./Sheet";
import { Intro } from "./Intro";
import { LiquidNav } from "./LiquidNav";
import { PhotoTunnel } from "./PhotoTunnel";
import {
  arrival, arrivalDue, cameraShow, detent, FLYOVER_RE, go, goBack, introOpen, isDesktop, mapApi, mapBearing, mapFailed, replayState, searchQuery, toastMsg,
  trailMode, tunnelOpen, view,
} from "./state";
import { startTrailMode, TrailMode } from "./TrailMode";

const mapData = computed<MapData>(() => {
  const byId = new Map(days.value.map((d) => [d.id, d]));
  const photos = media.value
    .filter((m) => mediaPositions.value.has(m.id) && byId.has(m.day_id))
    .map((m) => ({ m, c: mediaPositions.value.get(m.id)!, day: byId.get(m.day_id)! }));
  const lp = latestPosition.value;
  const ld = latestDay.value;
  let recent: LngLat[] = [];
  if (lp && ld) {
    const after = positions.value.filter((p) => p.recorded_at.slice(0, 10) > ld.date || p.recorded_at > ld.updated_at);
    if (after.length) {
      const start: LngLat | null = ld.end_lng !== null && ld.end_lat !== null ? [ld.end_lng, ld.end_lat] : null;
      recent = [...(start ? [start] : []), ...after.map((p) => [p.lng, p.lat] as LngLat)];
    }
  }
  return {
    route: route.value,
    days: days.value,
    walked: walked.value,
    photos,
    recent,
  };
});

const liveData = computed<LiveData | null>(() => {
  const lp = latestPosition.value;
  if (!lp) return null;
  return {
    c: [lp.lng, lp.lat], stale: liveState.value === "stale", name: hikerName.value || "Ewan",
    label: `${t(liveState.value === "live" ? "live" : "lastKnown")}, ${relTime(lp.recorded_at, lang.value)}`,
  };
});

/** each kind of place answers a touch in its own voice: huts low, summits high */
const POP_PITCH: Record<string, number> = { hut: 0.85, camp: 0.95, gap: 0.8, fall: 1.1, view: 1.15, pass: 1.25, peak: 1.4 };

/** whether the map is tilted, for the 2D / 3D button */
const map3d = signal(false);

function focusTarget(): LngLat | null {
  const lp = latestPosition.value;
  if (lp) return [lp.lng, lp.lat];
  const ld = latestDay.value;
  if (ld?.end_lng != null && ld.end_lat != null) return [ld.end_lng, ld.end_lat];
  if (ld?.end_km != null) return route.value.pointAt(ld.end_km);
  return null;
}

/** Whether this visit opens on the plain map (not a link to a day, a place or the flyover): then the trail draws itself in. */
function arrivesPlain() {
  const h = location.hash;
  return !FLYOVER_RE.test(h) && !/^#\/?(jour|day|lieu|place)\//.test(h);
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Where the island sits during the presentation: above the words on a phone, beside them on a computer. */
function introPadding() {
  const w = window.innerWidth, h = window.innerHeight;
  const short = h < 520; // a phone held sideways: every pixel of height counts (but the language button stays clear)
  // on a phone, above the words: on a small one they climb higher than half the screen, and Bluff must stay clear
  const words = document.querySelector(".intro__body")?.getBoundingClientRect().top ?? h;
  return isDesktop.peek()
    ? { top: short ? 54 : 70, bottom: short ? 18 : 70, left: Math.round(w * 0.52), right: 60 }
    : { top: 64, bottom: Math.round(Math.max(h * 0.47, h - words + 6)), left: 18, right: 64 }; // (room on the right for the names)
}

/** After the sheet has moved (it changes the map's padding): camera flights start from the new framing. */
const afterLayout = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

function Brand({ inPanel }: { inPanel?: boolean }) {
  const l = lang.value;
  const s = settings.value;
  const tag = (l === "en" ? s?.site_tagline_en : s?.site_tagline_fr) || t("whereNow");
  return (
    <button class={`brand${inPanel ? " brand--panel" : " glass"}`} type="button" onClick={() => go({ name: "about" })} aria-label={t("about")}>
      <BrandMark class="brand__mark" kind="face" />
      <span class="brand__text">
        <span class="brand__title" translate={false}>{s?.site_title || "Te Araroa"}</span>
        <span class="brand__tag">{tag}</span>
      </span>
    </button>
  );
}

function Skeleton() {
  return (
    <div class="skel" aria-busy="true" aria-label={t("loading")}>
      <span class="w1" /><span class="w2" /><span class="w3" /><span class="w1" />
    </div>
  );
}

/** The map's own buttons: map modes, 2D / 3D, back to Ewan, and the compass once the map is turned. */
function Controls() {
  const open = modesOpen.value;
  const is3d = map3d.value;
  const b = mapBearing.value;
  const turned = Math.abs(((b + 540) % 360) - 180) > 3; // the map is turned more than 3° off north
  return (
    <nav class="controls" aria-label={t("mapModes")}>
      <div class="controls__group glass" inert={!!trailMode.value || introOpen.value || tunnelOpen.value}>
        <button type="button" data-modes-toggle onClick={() => (modesOpen.value = !open)} aria-expanded={open} aria-label={t("mapModes")} title={t("mapModes")} class={open ? "is-on" : ""}>
          <MapIcon />
        </button>
        <button type="button" onClick={() => mapApi.value?.toggle3d()} aria-label={is3d ? t("view2d") : t("view3d")} title={is3d ? t("view2d") : t("view3d")}>
          <span class="num">{is3d ? "2D" : "3D"}</span>
        </button>
        <button type="button" onClick={() => { const c = focusTarget(); if (c) mapApi.value?.flyTo(c, 12.5); else mapApi.value?.overview(route.value); }} aria-label={t("recenter")} title={t("recenter")}>
          <Locate class={liveState.value === "live" ? "is-on" : ""} />
        </button>
      </div>
      {turned && (
        <button type="button" class="compass glass" aria-label={t("compass")} title={t("compass")}
          onClick={() => mapApi.value?.map.easeTo({ bearing: 0, duration: 600 })}>
          <Compass style={{ transform: `rotate(${-b}deg)` }} />
        </button>
      )}
    </nav>
  );
}

/** What the camera is doing on its own, with a way out. */
function ShowPill() {
  const s = cameraShow.value;
  const l = lang.value;
  if (!s) return null;
  if (s.kind === "eye") {
    return (
      <div class="show-pill show-pill--eye glass" role="status">
        <Eye />
        <span class="show-pill__text"><strong>{t("eyeTitle")}</strong><small>{t("eyeSub")}</small></span>
        <button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={endEyeView}><Close /></button>
      </div>
    );
  }
  const p = s.id ? placeById.value.get(s.id) : null;
  return (
    <div class="show-pill glass" role="status">
      <Orbit />
      <span class="show-pill__text"><strong>{t("orbitTitle")}</strong>{p && <small>{placeName(p, l)}</small>}</span>
      <button class="iconbtn" type="button" data-sfx="close" aria-label={t("stopOrbit")} onClick={() => { mapApi.value?.stopShow(); cameraShow.value = null; }}><Close /></button>
    </div>
  );
}

/** The day on screen, if it can be flown over in 3D. */
const replayable = computed(() => {
  const v = view.value;
  if (v.name !== "day") return null;
  const d = dayByNumber.value.get(v.n);
  if (!d || d.kind === "rest" || d.start_km === null || d.end_km === null || Math.abs(d.end_km - d.start_km) < 0.3) return null;
  const km = dayKm(d);
  return km !== null && km > 0.3 ? d : null;
});

const viewKey = (v: ReturnType<typeof view.peek>) => (v.name === "day" ? `day-${v.n}` : v.name === "place" ? `place-${v.id}` : v.name);

export function App() {
  const mapEl = useRef<HTMLDivElement>(null);

  // ---- map lifecycle
  useEffect(() => {
    let tm: TrailMap | null = null;
    let disposeData: (() => void) | undefined;
    (async () => {
      const land = OFFLINE_MAP ? ((await import("../dev/nz-land.json")).default as unknown as GeoJSON.Feature) : undefined;
      const prefs = mapPrefs.peek();
      try {
      tm = new TrailMap(mapEl.current!, {
        onDay: (n) => { play("open"); go({ name: "day", n }); },
        onPhoto: (n, id) => go({ name: "day", n, photo: id }),
        onLive: () => { go({ name: "home" }); detent.value = "half"; },
        onPlace: (id) => { play("pop", POP_PITCH[placeById.peek().get(id)?.t ?? ""] ?? 1); go({ name: "place", id }); },
        onStation: (i) => { play("pop", 0.8); go({ name: "place", id: `s${i}` }); },
        onLanded: () => play("ping"),
        // moving the map leaves the sheet where it is (as in Apple Maps): only the map modes card closes
        onInteract: () => { modesOpen.value = false; },
        onUserInput: () => replayState.peek()?.stop(true),
        // a tap on nothing closes the place card, like tapping beside a pin in Maps
        onEmptyTap: () => {
          if (modesOpen.peek() || performance.now() - modesClosedAt < 500) { modesOpen.value = false; return; } // that tap closed the map modes
          if (view.peek().name === "place") goBack();
        },
      }, land, { base: prefs.base, contours: prefs.contours, sun: prefs.sun, groups: poiGroups.peek(), arrival: arrivesPlain() });
      } catch (e) {
        // no WebGL 2 (an older iPad, say): the trail is drawn plainly, and the buttons that need the map go away
        console.warn("map unavailable", e);
        mapFailed.value = true;
        document.documentElement.classList.add("no-map");
        return;
      }
      mapApi.value = tm;
      if (import.meta.env.DEV) {
        // for the screenshot scripts: the map, and the few switches a visitor would flip
        Object.assign(window, { __tm: tm, __ui: { detent, go, startTrailMode, startEyeView, modesOpen, arrival, introOpen }, __maplibre: (await import("maplibre-gl")).default });
      }
      const m = tm.map;
      let raf = 0;
      m.on("rotate", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; mapBearing.value = m.getBearing(); }); });
      m.on("pitchend", () => (map3d.value = m.getPitch() > 5));
      m.on("moveend", () => (map3d.value = m.getPitch() > 5));
      const d1 = effect(() => tm!.setData(mapData.value));
      const d2 = effect(() => tm!.setLive(liveData.value));
      const d3 = effect(() => tm!.setPois(mapPois.value));
      const d4 = effect(() => tm!.setPoiGroups(poiGroups.value));
      const d5 = effect(() => {
        const p = mapPrefs.value;
        tm!.setBase(p.base);
        tm!.setContours(p.contours);
        if (tm!.sunLightOn !== p.sun) tm!.setSunLight(p.sun);
      });
      disposeData = () => { d1(); d2(); d3(); d4(); d5(); };
    })();
    return () => { disposeData?.(); tm?.destroy(); mapApi.value = null; };
  }, []);

  // LINZ imagery when a key is configured
  useEffect(() => effect(() => { mapApi.value?.setLinzKey(settings.value?.linz_api_key ?? null); }), []);

  // ---- the presentation (first visit): the map sways over the island until the visitor goes in
  useEffect(() => effect(() => {
    const tm = mapApi.value;
    if (!tm || !introOpen.value) return;
    let stop: (() => void) | null = null, alive = true;
    tm.holdArrival(true); // Ewan and his trail wait behind the presentation, however long it stays
    tm.whenReady().then(() => { if (alive) stop = tm.introLoop(route.peek(), introPadding()); });
    return () => {
      alive = false;
      stop?.();
      tm.holdArrival(false);
      tm.unclaimCamera(); // the dive to Ewan that follows is what they asked for by going in
    };
  }), []);

  // ---- arrival (after the presentation, when there is one)
  useEffect(() => effect(() => {
    const tm = mapApi.value;
    if (!tm || status.value !== "ready" || introOpen.value || !arrivalDue.value) return;
    arrivalDue.value = false;
    const fly = FLYOVER_RE.exec(location.hash);
    if (fly) {
      // a flyover link: straight into it, from its km (or from where Ewan is)
      tm.skipArrival();
      const km = fly[1] !== undefined ? parseFloat(fly[1]) : phase.peek() === "before" ? 0 : progressKm.peek();
      tm.whenReady().then(() => startTrailMode(km));
      return;
    }
    const v = view.peek();
    if (v.name === "day" || v.name === "place") { tm.skipArrival(); return; } // the view effect frames it
    const target = focusTarget();
    // The one orchestrated moment: over the whole island, the trail he walked lights up from Ship Cove while his
    // kilometres count up on the same clock; he lands with a ping and the camera dives to him. It starts once the
    // map is on screen (or 1.5 s after the data at the latest, so a slow map never holds the page back).
    const D = 2200;
    const counting = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && progressKm.peek() > 0.5;
    if (counting) arrival.value = 0;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const root = document.documentElement;
      root.classList.add("is-arriving");
      void tm.drawIn(t0, D).then(() => window.setTimeout(() => root.classList.remove("is-arriving"), 2000));
      if (counting) {
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / D);
          arrival.value = k < 1 ? easeInOut(k) : null;
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      tm.whenReady().then(() => window.setTimeout(() => tm.intro(target, route.peek()), Math.max(0, t0 + 1500 - performance.now())));
    };
    tm.whenReady().then(begin);
    window.setTimeout(begin, 1500);
  }), []);

  // ---- react to navigation: select and frame what the view is about (once per view, not on every data refresh)
  useEffect(() => {
    let framed = "";
    return effect(() => {
      const tm = mapApi.value;
      const v = view.value;
      if (!tm) return;
      const key = viewKey(v);
      // a new view ends the camera show of the old one
      const show = cameraShow.peek();
      if (show && key !== framed && !(show.kind === "orbit" && v.name === "place" && show.id === v.id) && !(show.kind === "eye" && v.name === "home")) {
        show.stop();
        tm.stopShow();
        cameraShow.value = null;
      }
      if (v.name === "day") {
        tm.selectAt(null);
        const d = dayByNumber.value.get(v.n);
        if (!d) return;
        tm.select(d);
        if (framed !== key) { framed = key; afterLayout(() => tm.whenReady().then(() => tm.flyToDay(d, route.peek()))); }
        return;
      }
      tm.select(null);
      if (v.name === "place") {
        const p = placeById.value.get(v.id);
        if (!p) return; // the places are still loading: this runs again once they are here
        tm.selectAt(p.c);
        if (framed !== key) { framed = key; afterLayout(() => tm.whenReady().then(() => tm.flyToPlace(p.c, route.peek(), p.km, p.t))); }
        return;
      }
      tm.selectAt(null);
      framed = key;
    });
  }, []);

  // ---- searching shows the matching places on the map, and frames them
  useEffect(() => {
    let timer: number | undefined;
    let lastFit = "";
    const dispose = effect(() => {
      const tm = mapApi.value;
      const v = view.value;
      const q = searchQuery.value.trim();
      clearTimeout(timer); // a framing still waiting belongs to an older search (or to a view left since)
      if (!tm) return;
      if (v.name !== "explore" || !q) { tm.setPoiFilter(null); lastFit = ""; return; }
      const res = searchPlaces(q, places.value);
      tm.setPoiFilter(res.filter((p) => p.t !== "town").map((p) => p.id));
      if (!res.length || lastFit === q) return;
      timer = window.setTimeout(() => { lastFit = q; tm.fitPlaces(res.slice(0, 30).map((p) => p.c)); }, 650);
    });
    return () => { clearTimeout(timer); dispose(); };
  }, []);

  // Keyboard and screen-reader users: when the control they used disappears with the old view,
  // put focus on the new view's heading instead of dropping it on the page.
  useEffect(() => {
    let first = true;
    return effect(() => {
      viewKey(view.value);
      if (first) { first = false; return; }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const a = document.activeElement;
        if (a && a !== document.body) return;
        document.querySelector<HTMLElement>(".sheet [data-autofocus]")?.focus({ preventScroll: true });
      }));
    });
  }, []);

  // keep the sheet scrolled to top when the view changes
  useEffect(() => effect(() => {
    viewKey(view.value);
    const body = document.querySelector(".sheet__body");
    if (body) body.scrollTop = 0;
  }), []);

  const v = view.value;

  return (
    <>
      <div class="map" ref={mapEl} />
      {mapFailed.value && <MapFallback />}

      <header class="topbar" inert={!!trailMode.value || introOpen.value || tunnelOpen.value}>
        <Brand />
        <button class="topbtn glass" type="button" onClick={openSearch} aria-label={t("searchLabel")} title={t("searchLabel")}><Search /></button>
      </header>

      <Controls />
      {modesOpen.value && <MapModes />}

      <Sheet label={t("whereNow")} inert={!!trailMode.value || introOpen.value || tunnelOpen.value}>
        {isDesktop.value && <Brand inPanel />}
        {status.value === "error" && !days.value.length ? (
          <div>
            <p class="empty">{t("loadError")}</p>
            <button class="btn" type="button" style={{ marginTop: "14px" }} onClick={() => location.reload()}>{t("retry")}</button>
          </div>
        ) : status.value === "loading" && !days.value.length && !settings.value && v.name !== "place" && v.name !== "explore" ? <Skeleton /> : (
          <div class="view" key={v.name === "place" ? "place" : v.name}>
            {v.name === "day" ? <DayView n={v.n} photo={v.photo} />
              : v.name === "place" ? <PlaceView id={v.id} />
              : v.name === "explore" ? <ExploreView />
              : v.name === "journal" ? <Journal />
              : v.name === "stats" ? <Stats />
              : v.name === "about" ? <About />
              : <Home />}
          </div>
        )}
        {offline.value && <p class="fine" style={{ marginTop: "18px" }}>{t("offline")}</p>}
      </Sheet>

      <LiquidNav inert={!!trailMode.value || introOpen.value || tunnelOpen.value} />

      {replayable.value && !replayState.value && !cameraShow.value && (isDesktop.value || detent.value !== "full") && (
        <button class="replay-fab glass" type="button" data-sfx="whoosh" onClick={() => startReplay(replayable.value!)}>
          <Replay />{t("replay3d")}
        </button>
      )}

      {replayState.value && (
        <div class="replay-hud glass" role="status">
          <span class="replay-hud__title">{t("day", { n: replayState.value.n })}</span>
          <span class="replay-hud__bar"><span style={{ width: `${Math.round(replayState.value.progress * 100)}%` }} /></span>
          <button class="iconbtn" type="button" aria-label={t("stopReplay")} onClick={() => replayState.value?.stop()}>✕</button>
        </div>
      )}

      {!replayState.value && <ShowPill />}
      {trailMode.value && <TrailMode />}

      <div class={`toast glass${toastMsg.value ? " is-on" : ""}`} role="status" aria-live="polite">{toastMsg.value}</div>
      {tunnelOpen.value && !introOpen.value && <PhotoTunnel />}
      {introOpen.value && <Intro />}
    </>
  );
}
