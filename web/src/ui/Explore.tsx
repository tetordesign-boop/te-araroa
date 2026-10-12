import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { lang, t } from "../i18n";
import { phase, progressKm, route } from "../lib/data";
import { fmtKm } from "../lib/format";
import {
  groupOfPlace, notable, places, poiGroups, searchPlaces, shortStation, toggleGroup, type Place,
} from "../lib/places";
import { GROUPS, groupLabel, type PoiGroup } from "../map/pois";
import { PageHead } from "./Pages";
import { altText, openPlace, PlaceBadge, placeKindLabel, placeName, relationShort } from "./Place";
import { Check, ChevronRight, Close, Play, Search } from "./icons";
import { detent, go, searchQuery, view } from "./state";
import { startTrailMode } from "./TrailMode";

const GROUP_KIND = { huts: "hut", camps: "camp", summits: "pass", sights: "fall" } as const;

let wantFocus = false;
let standIn: HTMLInputElement | null = null;
/** Open the explorer with the keyboard up, ready to type. */
export function openSearch() {
  if (view.peek().name === "explore") {
    // already here: just bring the field up (the sheet may have been lowered)
    detent.value = "full";
    document.querySelector<HTMLInputElement>(".explore .search input")?.focus({ preventScroll: true });
    return;
  }
  wantFocus = true;
  // iOS only opens the keyboard for a focus made during the tap itself: a stand-in field holds it
  // until the real one is on screen, and focus then moves over without the keyboard closing
  try {
    standIn?.remove();
    const tmp = document.createElement("input");
    tmp.setAttribute("aria-hidden", "true");
    tmp.tabIndex = -1;
    tmp.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none;";
    document.body.appendChild(tmp);
    tmp.focus({ preventScroll: true });
    standIn = tmp;
  } catch (_) { /* not critical */ }
  go({ name: "explore" });
}

export function GroupChips({ counts, scroll }: { counts?: Record<PoiGroup, number>; scroll?: boolean }) {
  const l = lang.value;
  const on = poiGroups.value;
  return (
    <div class={`chips${scroll ? " chips--scroll hscroll" : ""}`} role="group" aria-label={t("placesOnMap")}>
      {GROUPS.map((g) => (
        <button type="button" class={`chip${on.includes(g) ? " is-on" : ""}`} aria-pressed={on.includes(g)} onClick={() => toggleGroup(g)}>
          <PlaceBadge kind={GROUP_KIND[g]} size={20} />
          <span>{groupLabel(g, l)}</span>
          {counts && <span class="chip__n num">{counts[g]}</span>}
        </button>
      ))}
    </div>
  );
}

export function PlaceRow({ p, showRel = true }: { p: Place; showRel?: boolean }) {
  const l = lang.value;
  const alt = altText(p, l);
  const rel = showRel ? relationShort(p, l) : null;
  return (
    <a class="prow" href={`#/lieu/${encodeURIComponent(p.id)}`} onClick={(e) => { e.preventDefault(); openPlace(p.id); }}>
      <PlaceBadge kind={p.t} />
      <span class="prow__main">
        <span class="prow__name">{placeName(p, l)}</span>
        <span class="prow__meta">
          {placeKindLabel(p, l)}{alt ? <>, <span class="num">{alt}</span></> : null}, <span class="num">km {fmtKm(p.km, l, p.km < 10 ? 1 : 0)}</span>
        </span>
      </span>
      {rel && (
        <span class={`prow__rel${rel.passed ? " is-passed" : ""}`}>
          {rel.passed && <Check />}{rel.text}
        </span>
      )}
    </a>
  );
}

/** The trail cut into sections between its towns, each with its places. */
function Sections({ list }: { list: Place[] }) {
  const l = lang.value;
  const towns = route.value.places();
  const sections = useMemo(() => {
    const out: { from: string; to: string; items: Place[] }[] = [];
    for (let i = 0; i < towns.length - 1; i++) out.push({ from: shortStation(towns[i].n), to: shortStation(towns[i + 1].n), items: [] });
    for (const p of list) {
      if (p.t === "town") continue;
      let i = towns.findIndex((tw, j) => j < towns.length - 1 && p.km >= tw.km && p.km < towns[j + 1].km);
      if (i < 0) i = out.length - 1;
      out[i]?.items.push(p);
    }
    return out.filter((s) => s.items.length);
  }, [list, towns]);
  return (
    <>
      {sections.map((s) => (
        <section class="psection">
          <h3 class="psection__head">{s.from}<span aria-hidden="true"> – </span><span class="sr-only">{l === "fr" ? " à " : " to "}</span>{s.to}</h3>
          <div class="rows">{s.items.map((p) => <PlaceRow p={p} />)}</div>
        </section>
      ))}
    </>
  );
}

export function ExploreView() {
  const l = lang.value;
  const q = searchQuery.value;
  const input = useRef<HTMLInputElement>(null);
  const all = places.value;
  const groups = poiGroups.value;
  const shown = useMemo(() => all.filter((p) => { const g = groupOfPlace(p); return g === null || groups.includes(g); }), [all, groups]);
  const results = useMemo(() => (q.trim() ? searchPlaces(q, all) : null), [q, all]);
  const counts = useMemo(() => {
    const c = { huts: 0, camps: 0, summits: 0, sights: 0 } as Record<PoiGroup, number>;
    for (const p of all) { const g = groupOfPlace(p); if (g) c[g]++; }
    return c;
  }, [all]);
  const from = phase.value === "before" ? 0 : progressKm.value;
  const ahead = useMemo(() => shown.filter((p) => p.km > from + 0.3 && p.t !== "peak" && p.t !== "view").slice(0, 6), [shown, from]);

  // open with the keyboard up when coming from a search button
  useLayoutEffect(() => {
    if (!wantFocus) return;
    wantFocus = false;
    input.current?.focus({ preventScroll: true });
    standIn?.remove();
    standIn = null;
  }, []);

  return (
    <div class="page explore">
      <PageHead title={t("exploreTitle")} />
      <label class="search">
        <Search />
        <input ref={input} type="search" enterKeyHint="search" autocomplete="off" spellcheck={false}
          placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} value={q}
          onInput={(e) => (searchQuery.value = (e.target as HTMLInputElement).value)} />
        {q && <button type="button" class="search__clear" aria-label={t("clearSearch")} onClick={() => { searchQuery.value = ""; input.current?.focus(); }}><Close /></button>}
      </label>

      {results ? (
        <section class="block block--tight">
          <p class="sub" aria-live="polite">{results.length ? (results.length === 1 ? t("resultOne") : t("resultsN", { n: results.length })) : t("noResults", { q: q.trim() })}</p>
          {results.length > 0 && <div class="rows" style={{ marginTop: "10px" }}>{results.map((p) => <PlaceRow p={p} />)}</div>}
        </section>
      ) : (
        <>
          <GroupChips counts={counts} scroll />

          <button class="cta" type="button" onClick={() => startTrailMode(from)}>
            <span class="cta__icon" aria-hidden="true"><Play /></span>
            <span class="cta__text">
              <strong>{t("flyoverCta")}</strong>
              <span>{t("flyoverSub")}</span>
            </span>
            <ChevronRight class="row__chev" />
          </button>

          {ahead.length > 0 && (
            <section class="block">
              <h2 class="h-section" style={{ marginBottom: "12px" }}>{phase.value === "before" ? t("fromTheStart") : t("aheadOfEwan")}</h2>
              <div class="rows">{ahead.map((p) => <PlaceRow p={p} />)}</div>
            </section>
          )}

          <section class="block">
            <h2 class="h-section">{t("wholeTrail")}</h2>
            {all.length ? <Sections list={shown.filter(notable)} /> : <p class="empty" style={{ marginTop: "8px" }}>{t("loading")}</p>}
            <p class="fine" style={{ marginTop: "18px" }}>{t("osmCredit")}</p>
          </section>
        </>
      )}
    </div>
  );
}
