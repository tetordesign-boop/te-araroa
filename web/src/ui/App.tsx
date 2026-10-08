import { computed, effect } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { OFFLINE_MAP } from "../config";
import { lang, setLang, t } from "../i18n";
import {
  dayByNumber, days, latestDay, latestPosition, liveState, media, mediaPositions, positions,
  route, settings, status, walked, offline,
} from "../lib/data";
import { relTime } from "../lib/format";
import type { LngLat } from "../lib/geo";
import { TrailMap, type LiveData, type MapData } from "../map/map";
import { DayView } from "./DayView";
import { Home } from "./Home";
import { Layers, Locate, Marker, Mountain } from "./icons";
import { About, Journal, Stats } from "./Pages";
import { Sheet } from "./Sheet";
import { detent, go, mapApi, replayState, toastMsg, view } from "./state";

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
  return { c: [lp.lng, lp.lat], stale: liveState.value === "stale", label: `${t(liveState.value === "live" ? "live" : "lastKnown")}, ${relTime(lp.recorded_at, lang.value)}` };
});

function focusTarget(): LngLat | null {
  const lp = latestPosition.value;
  if (lp) return [lp.lng, lp.lat];
  const ld = latestDay.value;
  if (ld?.end_lng != null && ld.end_lat != null) return [ld.end_lng, ld.end_lat];
  if (ld?.end_km != null) return route.value.pointAt(ld.end_km);
  return null;
}

export function App() {
  const mapEl = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<"satellite" | "relief">("satellite");
  const [is3d, setIs3d] = useState(true);
  const introDone = useRef(false);

  // ---- map lifecycle
  useEffect(() => {
    let tm: TrailMap | null = null;
    let disposeData: (() => void) | undefined;
    (async () => {
      const land = OFFLINE_MAP ? ((await import("../dev/nz-land.json")).default as unknown as GeoJSON.Feature) : undefined;
      tm = new TrailMap(mapEl.current!, {
        onDay: (n) => go({ name: "day", n }),
        onPhoto: (n, id) => go({ name: "day", n, photo: id }),
        onLive: () => { go({ name: "home" }); detent.value = "half"; },
        onInteract: () => {},
      }, land);
      mapApi.value = tm;
      const d1 = effect(() => tm!.setData(mapData.value));
      const d2 = effect(() => tm!.setLive(liveData.value));
      disposeData = () => { d1(); d2(); };
      await tm.whenReady();
      tm.map.getContainer().classList.toggle("base-relief", false);
    })();
    return () => { disposeData?.(); tm?.map.remove(); mapApi.value = null; };
  }, []);

  // LINZ imagery when a key is configured
  useEffect(() => effect(() => { mapApi.value?.setLinzKey(settings.value?.linz_api_key ?? null); }), []);

  // ---- first arrival
  useEffect(() => effect(() => {
    const tm = mapApi.value;
    if (!tm || introDone.current || status.value !== "ready") return;
    introDone.current = true;
    const v = view.peek();
    if (v.name === "day") return; // the day effect frames it
    const target = focusTarget();
    window.setTimeout(() => tm.intro(target, route.peek()), 350);
  }), []);

  // ---- react to navigation
  useEffect(() => effect(() => {
    const tm = mapApi.value;
    const v = view.value;
    if (!tm) return;
    if (v.name === "day") {
      const d = dayByNumber.value.get(v.n);
      if (!d) return;
      tm.select(d);
      tm.whenReady().then(() => tm.flyToDay(d, route.peek()));
    } else {
      tm.select(null);
    }
  }), []);

  // keep the sheet scrolled to top when the view changes
  useEffect(() => effect(() => {
    view.value;
    const body = document.querySelector(".sheet__body");
    if (body) body.scrollTop = 0;
  }), []);

  const v = view.value;
  const l = lang.value;
  const s = settings.value;
  const tag = (l === "en" ? s?.site_tagline_en : s?.site_tagline_fr) || t("whereNow");

  const toggleBase = () => {
    const next = base === "satellite" ? "relief" : "satellite";
    setBase(next);
    mapApi.value?.setBase(next);
    mapApi.value?.map.getContainer().classList.toggle("base-relief", next === "relief");
  };

  return (
    <>
      <div class="map" ref={mapEl} />

      <header class="topbar">
        <button class="brand glass" type="button" onClick={() => go({ name: "about" })} aria-label={t("about")}>
          <Marker class="brand__mark" />
          <span>
            <span class="brand__title">{s?.site_title || "Te Araroa"}</span>
            <span class="brand__tag">{tag}</span>
          </span>
        </button>
      </header>

      <nav class="controls glass" aria-label="Carte">
        <button type="button" onClick={toggleBase} aria-label={base === "satellite" ? t("plan") : t("satellite")} title={base === "satellite" ? t("plan") : t("satellite")}>
          {base === "satellite" ? <Mountain /> : <Layers />}
        </button>
        <button type="button" onClick={() => setIs3d(mapApi.value?.toggle3d() ?? true)} aria-label={is3d ? t("view2d") : t("view3d")} title={is3d ? t("view2d") : t("view3d")}>
          <span class="num">{is3d ? "2D" : "3D"}</span>
        </button>
        <button type="button" onClick={() => { const c = focusTarget(); if (c) mapApi.value?.flyTo(c, 12.5); else mapApi.value?.overview(route.value); }} aria-label={t("recenter")} title={t("recenter")}>
          <Locate class={liveState.value === "live" ? "is-on" : ""} />
        </button>
        <button type="button" onClick={() => setLang(l === "fr" ? "en" : "fr")} aria-label={t("lang")} title={t("lang")}>
          <span>{t("langCode")}</span>
        </button>
      </nav>

      <Sheet label={t("whereNow")}>
        {status.value === "error" && !days.value.length ? (
          <div>
            <p class="empty">{t("loadError")}</p>
            <button class="btn" type="button" onClick={() => location.reload()}>{t("retry")}</button>
          </div>
        ) : v.name === "day" ? <DayView n={v.n} photo={v.photo} />
          : v.name === "journal" ? <Journal />
          : v.name === "stats" ? <Stats />
          : v.name === "about" ? <About />
          : <Home />}
        {offline.value && <p class="fine" style={{ marginTop: "18px" }}>{t("offline")}</p>}
      </Sheet>

      {replayState.value && (
        <div class="replay-hud glass" role="status">
          <span class="replay-hud__title">{t("day", { n: replayState.value.n })}</span>
          <span class="replay-hud__bar"><span style={{ width: `${Math.round(replayState.value.progress * 100)}%` }} /></span>
          <button class="iconbtn" type="button" aria-label={t("stopReplay")} onClick={() => replayState.value?.stop()}>✕</button>
        </div>
      )}

      <div class={`toast glass${toastMsg.value ? " is-on" : ""}`} role="status" aria-live="polite">{toastMsg.value}</div>
    </>
  );
}
