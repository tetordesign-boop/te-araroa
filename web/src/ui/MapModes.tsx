// The map's settings, like Apple Maps' map modes card: the base map, contour lines, sunlight, places.
import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { lang, t } from "../i18n";
import { clock, latestPosition } from "../lib/data";
import type { BaseStyle } from "../map/style";
import { sunPosition } from "../map/sun";
import { GroupChips } from "./Explore";
import { Close } from "./icons";
import { mapApi } from "./state";

interface MapPrefs { base: BaseStyle; contours: boolean; sun: boolean }
const PREFS_KEY = "map-prefs-v1";
function initialPrefs(): MapPrefs {
  const def: MapPrefs = { base: "explore", contours: true, sun: false };
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (v && (v.base === "explore" || v.base === "satellite")) return { ...def, ...v };
  } catch (_) { /* storage unavailable */ }
  return def;
}
export const mapPrefs = signal<MapPrefs>(initialPrefs());
export const modesOpen = signal(false);
/** when a tap outside last closed the card (that same tap must not also act on the map) */
export let modesClosedAt = 0;

export function setPrefs(p: Partial<MapPrefs>) {
  mapPrefs.value = { ...mapPrefs.value, ...p };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(mapPrefs.value)); } catch (_) { /* ignore */ }
}

const DIRS: Record<"fr" | "en", string[]> = {
  fr: ["au nord", "au nord-est", "à l'est", "au sud-est", "au sud", "au sud-ouest", "à l'ouest", "au nord-ouest"],
  en: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"],
};

function sunLine(l: "fr" | "en") {
  clock.value; // refresh with the clock
  const lp = latestPosition.value;
  const c = lp ? [lp.lng, lp.lat] : mapApi.value?.map.getCenter().toArray() ?? [172.5, -43.5];
  const s = sunPosition(new Date(), c[1], c[0]);
  if (s.altitude < -0.8) return t("sunNight");
  const dir = DIRS[l][Math.round(s.azimuth / 45) % 8];
  return t("sunNow", { alt: Math.round(s.altitude), dir });
}

/** Little drawings of the two base maps. */
function Thumb({ kind }: { kind: BaseStyle }) {
  if (kind === "satellite") {
    return (
      <svg viewBox="0 0 120 76" aria-hidden="true" class="mthumb">
        <rect width="120" height="76" fill="#3d4f33" />
        <path d="M0 52 26 30 44 40 70 14 92 30 120 18V76H0z" fill="#6e6a5b" />
        <path d="M58 24 70 14 80 22 72 21 66 27zM86 27 92 30 99 26 95 24z" fill="#f4f6f7" />
        <path d="M0 62 30 50 52 58 84 46 120 54V76H0z" fill="#2f4428" />
        <path d="M8 70c10-6 22-7 34-3 9 3 15 2 22-2" fill="none" stroke="#5b7f93" stroke-width="5" stroke-linecap="round" />
        <path d="M18 76 40 56 58 50 74 36 92 34" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 76" aria-hidden="true" class="mthumb">
      <rect width="120" height="76" fill="#0F1B2E" />
      <path d="M0 76V44c14-6 22-16 38-14s26-16 44-18 26 4 38 0v64z" fill="#1B314C" />
      <path d="M62 14c8-3 14-2 20 4-6 3-12 4-20-4z" fill="#8299B8" />
      <path d="M0 58c18-4 30 4 44 0s22-10 38-6 26 0 38-4v28H0z" fill="#0E2B2E" />
      <g fill="none" stroke="#7DA5DC" stroke-opacity=".28" stroke-width=".8">
        <path d="M20 46c10-8 22-12 36-10s22-10 34-12" /><path d="M30 40c10-6 18-8 28-6s18-8 28-10" /><path d="M48 30c6-4 12-5 18-4s12-6 18-6" />
      </g>
      <path d="M86 62c6-6 16-6 22 0-6 5-16 5-22 0z" fill="#0D7487" stroke="#5CD6E6" stroke-width="1" />
      <path d="M18 76 40 56 58 50 74 36 92 34" fill="none" stroke="#C3D2EA" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round" />
      <path d="M18 76 40 56 58 50" fill="none" stroke="#FF6B12" stroke-opacity=".45" stroke-width="7" stroke-linecap="round" />
      <path d="M18 76 40 56 58 50" fill="none" stroke="#FF6B12" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}

export function MapModes() {
  const l = lang.value;
  const p = mapPrefs.value;
  const ref = useRef<HTMLDivElement>(null);

  // close on Escape and on a tap outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") modesOpen.value = false; };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current?.contains(el) || el.closest("[data-modes-toggle]")) return;
      modesClosedAt = performance.now();
      modesOpen.value = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    const card = ref.current;
    card?.querySelector<HTMLElement>("button[aria-pressed='true']")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      if (card?.contains(document.activeElement)) document.querySelector<HTMLElement>("[data-modes-toggle]")?.focus({ preventScroll: true });
    };
  }, []);

  const base = (b: BaseStyle) => (
    <button type="button" class="mbase" data-sfx="tap" aria-pressed={p.base === b} onClick={() => setPrefs({ base: b })}>
      <Thumb kind={b} />
      <span>{b === "explore" ? t("mapPlan") : t("satellite")}</span>
    </button>
  );

  return (
    <div class="modes glass" ref={ref} role="dialog" aria-label={t("mapModes")}>
      <div class="modes__head">
        <h2 class="modes__title">{t("mapModes")}</h2>
        <button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={() => (modesOpen.value = false)}><Close /></button>
      </div>
      <div class="modes__bases">{base("explore")}{base("satellite")}</div>
      <div class="modes__list">
        <label class={`switchrow${p.base === "satellite" ? " is-disabled" : ""}`}>
          <span class="switchrow__text">{t("contours")}</span>
          <input type="checkbox" role="switch" checked={p.contours} disabled={p.base === "satellite"}
            onChange={(e) => setPrefs({ contours: (e.target as HTMLInputElement).checked })} />
        </label>
        <label class="switchrow">
          <span class="switchrow__text">
            {t("realLight")}
            <small>{p.sun ? sunLine(l) : t("realLightSub")}</small>
          </span>
          <input type="checkbox" role="switch" checked={p.sun} onChange={(e) => setPrefs({ sun: (e.target as HTMLInputElement).checked })} />
        </label>
      </div>
      <h3 class="modes__sub">{t("placesOnMap")}</h3>
      <GroupChips />
    </div>
  );
}
