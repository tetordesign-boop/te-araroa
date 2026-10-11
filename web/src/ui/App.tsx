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
import { TrailMap, type LiveData, type MapData } from "../map/map";
import { DayView } from "./DayView";
import { ExploreView, openSearch } from "./Explore";
import { endEyeView, startEyeView } from "./eye";
import { Home } from "./Home";
import { dayKm } from "./Home";
import { Close, Compass, Eye, Locate, MapIcon, Marker, Orbit, Replay, Search } from "./icons";
import { MapModes, mapPrefs, modesOpen } from "./MapModes";
import { About, Journal, Stats } from "./Pages";
import { PlaceView, placeName } from "./Place";
import { startReplay } from "./replayControl";
import { Sheet } from "./Sheet";
import {
  cameraShow, detent, FLYOVER_RE, go, isDesktop, mapApi, mapBearing, replayState, searchQuery, toastMsg, trailMode, view,
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

/** After the sheet has moved (it changes the map's padding): camera flights start from the new framing. */
const afterLayout = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

function Brand({ inPanel }: { inPanel?: boolean }) {
  const l = lang.value;
  const s = settings.value;
  const tag = (l === "en" ? s?.site_tagline_en : s?.site_tagline_fr) || t("whereNow");
  return (
    <button class={`brand${inPanel ? " brand--panel" : " glass"}`} type="button" onClick={() => go({ name: "about" })} aria-label={t("about")}>
      <Marker class="brand__mark" />
      <span class="brand__text">
        <span class="brand__title">{s?.site_title || "Te Araroa"}</span>
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
      <div class="controls__group glass" inert={!!trailMode.value}>
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
      <div class="show-pill glass" role="status">
        <Eye />
        <span class="show-pill__text"><strong>{t("eyeTitle")}</strong><small>{t("eyeSub")}</small></span>
        <button class="iconbtn" type="button" aria-label={t("close")} onClick={endEyeView}><Close /></button>
      </div>
    );
  }
  const p = s.id ? placeById.value.get(s.id) : null;
  return (
    <div class="show-pill glass" role="status">
      <Orbit />
      <span class="show-pill__text"><strong>{t("orbitTitle")}</strong>{p && <small>{placeName(p, l)}</small>}</span>
      <button class="iconbtn" type="button" aria-label={t("stopOrbit")} onClick={() => { mapApi.value?.stopShow(); cameraShow.value = null; }}><Close /></button>
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
  const introDone = useRef(false);

  // ---- map lifecycle
  useEffect(() => {
    let tm: TrailMap | null = null;
    let disposeData: (() => void) | undefined;
    (async () => {
      const land = OFFLINE_MAP ? ((await import("../dev/nz-land.json")).default as unknown as GeoJSON.Feature) : undefined;
      const prefs = mapPrefs.peek();
      tm = new TrailMap(mapEl.current!, {
        onDay: (n) => go({ name: "day", n }),
        onPhoto: (n, id) => go({ name: "day", n, photo: id }),
        onLive: () => { go({ name: "home" }); detent.value = "half"; },
        onPlace: (id) => go({ name: "place", id }),
        onStation: (i) => go({ name: "place", id: `s${i}` }),
        onInteract: () => {
          modesOpen.value = false;
          if (!isDesktop.value && detent.value === "half") detent.value = "peek";
        },
        onUserInput: () => replayState.peek()?.stop(true),
      }, land, { base: prefs.base, contours: prefs.contours, sun: prefs.sun, groups: poiGroups.peek() });
      mapApi.value = tm;
      if (import.meta.env.DEV) {
        // for the screenshot scripts: the map, and the few switches a visitor would flip
        Object.assign(window, { __tm: tm, __ui: { detent, go, startTrailMode, startEyeView, modesOpen } });
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

  // ---- first arrival
  useEffect(() => effect(() => {
    const tm = mapApi.value;
    if (!tm || introDone.current || status.value !== "ready") return;
    introDone.current = true;
    const fly = FLYOVER_RE.exec(location.hash);
    if (fly) {
      // a flyover link: straight into it, from its km (or from where Ewan is)
      const km = fly[1] !== undefined ? parseFloat(fly[1]) : phase.peek() === "before" ? 0 : progressKm.peek();
      tm.whenReady().then(() => startTrailMode(km));
      return;
    }
    const v = view.peek();
    if (v.name === "day" || v.name === "place") return; // the view effect frames it
    const target = focusTarget();
    window.setTimeout(() => tm.intro(target, route.peek()), 350);
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

      <header class="topbar" inert={!!trailMode.value}>
        <Brand />
        <button class="topbtn glass" type="button" onClick={openSearch} aria-label={t("searchLabel")} title={t("searchLabel")}><Search /></button>
      </header>

      <Controls />
      {modesOpen.value && <MapModes />}

      <Sheet label={t("whereNow")} inert={!!trailMode.value}>
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

      {replayable.value && !replayState.value && !cameraShow.value && (isDesktop.value || detent.value !== "full") && (
        <button class="replay-fab glass" type="button" onClick={() => startReplay(replayable.value!)}>
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
    </>
  );
}
