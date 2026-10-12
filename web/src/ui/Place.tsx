import { useMemo } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t, type Key } from "../i18n";
import {
  clock, dayOnTrail, days, latestPosition, liveState, media, mediaPositions, phase, progressKm, route,
} from "../lib/data";
import { addDays, fmtDate, fmtInt, fmtKm, nzToday } from "../lib/format";
import { haversine, type LngLat } from "../lib/geo";
import { gapName, notable, placeById, places, type Place, type PlaceKind } from "../lib/places";
import { BADGE_GLYPHS } from "../map/icons";
import { kindLabel } from "../map/pois";
import type { Day, Lang, Media } from "../types";
import { titleOf } from "./Home";
import { ChevronLeft, ChevronRight, Close, External, Orbit, Share } from "./icons";
import { cameraShow, detent, go, goBack, hrefFor, isDesktop, mapApi, toast } from "./state";

// ------------------------------------------------------------------ small parts shared with the explorer
export function PlaceBadge({ kind, size = 30 }: { kind: PlaceKind; size?: number }) {
  return (
    <span class={`pbadge k-${kind}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: BADGE_GLYPHS[kind] }} />
    </span>
  );
}

export function placeName(p: Place, l: Lang) {
  return p.t === "gap" ? gapName(p.gap?.key ?? null, l) : p.n;
}

export function placeKindLabel(p: Place, l: Lang): string {
  if (p.t === "town") {
    if (p.station === 0) return l === "fr" ? "Départ du sentier" : "Start of the trail";
    if (p.station === route.value.places().length - 1) return l === "fr" ? "Arrivée du sentier" : "End of the trail";
    return t("trailTown");
  }
  if (p.poi) return kindLabel(p.poi, l);
  return t("transfer");
}

/** "1 310 m", "≈ 1 310 m" when read from the trail profile. */
export function altText(p: Place, l: Lang) {
  if (p.e === null) return null;
  return `${p.eApprox ? "≈ " : ""}${fmtInt(p.e, l)} m`;
}

/** Where a place sits for someone following Ewan: passed, ahead, here. */
export type Relation =
  | { kind: "here" }
  | { kind: "stopped"; day: Day }
  | { kind: "passed"; day: Day | null }
  | { kind: "ahead"; km: number; eta: string | null }
  | { kind: "start"; km: number };

export function relationOf(p: Place): Relation {
  const lp = latestPosition.value;
  if (lp && liveState.value === "live" && haversine([lp.lng, lp.lat], p.c) < Math.max(600, p.d + 300)) return { kind: "here" };
  if (phase.value === "before") return { kind: "start", km: p.km };
  const list = days.value;
  if ((p.t === "hut" || p.t === "camp" || p.t === "town") && p.d < 400) {
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.kind !== "transport" && d.end_km !== null && Math.abs(d.end_km - p.km) < 0.7) return { kind: "stopped", day: d };
    }
  }
  const walkedBy = list.find((d) => d.kind === "hike" && d.start_km !== null && d.end_km !== null
    && p.km >= Math.min(d.start_km, d.end_km) - 0.2 && p.km <= Math.max(d.start_km, d.end_km) + 0.2);
  if (walkedBy) return { kind: "passed", day: walkedBy };
  const here = progressKm.value;
  if (p.km <= here) return { kind: "passed", day: null };
  const ahead = p.km - here;
  const onTrail = dayOnTrail.value ?? list.length;
  const pace = onTrail > 0 ? here / onTrail : 0;
  const eta = list.length >= 5 && pace > 1 ? addDays(nzToday(new Date(clock.value)), Math.ceil(ahead / pace)) : null;
  return { kind: "ahead", km: ahead, eta };
}

/** Short status for lists: "dans 14 km", "passé". */
export function relationShort(p: Place, l: Lang): { text: string; passed: boolean } {
  const r = relationOf(p);
  switch (r.kind) {
    case "here": return { text: t("hereNow"), passed: false };
    case "stopped": case "passed": return { text: t("passed"), passed: true };
    case "ahead": return { text: t("inKm", { km: fmtKm(r.km, l, r.km < 10 ? 1 : 0) }), passed: false };
    case "start": return { text: `km ${fmtKm(r.km, l, r.km < 10 ? 1 : 0)}`, passed: false };
  }
}

export function openPlace(id: string, opts: { replace?: boolean } = {}) {
  go({ name: "place", id }, opts);
}

// ------------------------------------------------------------------ the card
function Relation({ p }: { p: Place }) {
  const l = lang.value;
  const r = relationOf(p);
  if (r.kind === "here") return <p class="prel prel--here"><span class="status__dot" aria-hidden="true" />{t("ewanHere")}</p>;
  if (r.kind === "start") return <p class="prel">{t("fromStart", { km: fmtKm(r.km, l, r.km < 10 ? 1 : 0) })}</p>;
  if (r.kind === "ahead") {
    return (
      <p class="prel">
        <strong>{t("ewanAhead", { km: fmtKm(r.km, l, r.km < 10 ? 1 : 0) })}</strong>
        {r.eta ? `, ${t("ewanEta", { date: fmtDate(r.eta, l, { weekday: "long", day: "numeric", month: "long" }) })}` : ""}
      </p>
    );
  }
  const d = r.day;
  if (!d) return <p class="prel">{t("ewanPassedNoDay")}</p>;
  return (
    <a class="prel prel--day" href={hrefFor({ name: "day", n: d.day_number })} onClick={(e) => { e.preventDefault(); go({ name: "day", n: d.day_number }); }}>
      <span class="prel__text">
        <span class="prel__kicker">{t(r.kind === "stopped" ? "ewanStopped" : p.d > 300 ? "ewanPassedNear" : "ewanPassed", { n: d.day_number })}</span>
        <span class="prel__title voice">{titleOf(d, l)}</span>
      </span>
      <ChevronRight class="row__chev" />
    </a>
  );
}

function Facts({ p }: { p: Place }) {
  const l = lang.value;
  const o = p.poi;
  if (!o) return null;
  const items: string[] = [];
  if (o.cap) items.push(t(o.t === "camp" ? "spotsN" : "bunksN", { n: o.cap }));
  if (o.fee === 1) items.push(t("feeYes"));
  if (o.fee === 0) items.push(t("feeNo"));
  if (o.book) items.push(t("booking"));
  if (o.water) items.push(t("water"));
  if (o.wc) items.push(t("toilets"));
  if (o.op) items.push(o.op === "DOC" ? t("byDoc") : o.op);
  if (!items.length) return null;
  return <ul class="pfacts" aria-label={l === "fr" ? "Sur place" : "On site"}>{items.map((x) => <li>{x}</li>)}</ul>;
}

const GAP_TEXT: Record<string, Key> = { rakaia: "gapRiver", rangitata: "gapRiver", wakatipu: "gapLake" };

function NearPhotos({ p }: { p: Place }) {
  const pos = mediaPositions.value;
  const radius = p.t === "town" ? 2500 : p.t === "peak" || p.t === "pass" ? 2000 : p.t === "gap" ? 0 : 900;
  const near = useMemo(() => {
    if (!radius) return [] as { m: Media; dist: number }[];
    const out: { m: Media; dist: number }[] = [];
    for (const m of media.value) {
      const c = pos.get(m.id);
      if (!c) continue;
      const dist = haversine(c as LngLat, p.c);
      if (dist <= radius) out.push({ m, dist });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 12);
  }, [p.id, media.value, pos]);
  if (!near.length) return null;
  const byId = new Map(days.value.map((d) => [d.id, d]));
  return (
    <section class="block pnear">
      <h2 class="h-section">{t("photosNear")}</h2>
      <div class="hscroll" role="list">
        {near.map(({ m }) => {
          const d = byId.get(m.day_id);
          if (!d) return null;
          return (
            <a role="listitem" class="pnear__item" href={hrefFor({ name: "day", n: d.day_number, photo: m.id })}
              onClick={(e) => { e.preventDefault(); go({ name: "day", n: d.day_number, photo: m.id }); }}
              aria-label={`${t("day", { n: d.day_number })}, ${t("photoBy")}`}>
              <img src={mediaUrl(m.thumb_path ?? m.path)} alt="" loading="lazy" decoding="async" />
              <span>{t("day", { n: d.day_number })}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function Around({ p }: { p: Place }) {
  const l = lang.value;
  const list = places.value.filter((x) => notable(x) || x.id === p.id);
  const i = list.findIndex((x) => x.id === p.id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  if (!prev && !next) return null;
  const item = (x: Place, dir: "prev" | "next") => (
    <a class={`pager__item${dir === "next" ? " pager__item--next" : ""}`} href={hrefFor({ name: "place", id: x.id })}
      onClick={(e) => { e.preventDefault(); openPlace(x.id, { replace: true }); }}>
      <span class="pager__dir">{dir === "prev" && <ChevronLeft />}{t(dir === "prev" ? "before" : "after")}{dir === "next" && <ChevronRight />}</span>
      <span class="pager__title">{placeName(x, l)}</span>
      <span class="pager__meta">{placeKindLabel(x, l)}, km {fmtKm(x.km, l, x.km < 10 ? 1 : 0)}</span>
    </a>
  );
  return (
    <nav class="pager" aria-label={t("alongTrail")}>
      {prev ? item(prev, "prev") : <span />}
      {next ? item(next, "next") : <span />}
    </nav>
  );
}

export function PlaceView({ id }: { id: string }) {
  const l = lang.value;
  const p = placeById.value.get(id);
  const show = cameraShow.value;
  if (!p) {
    return (
      <div>
        <div class="dhead"><span /><button class="iconbtn" type="button" aria-label={t("close")} onClick={goBack}><Close /></button></div>
        <p class="empty" style={{ marginTop: "12px" }}>{places.value.length ? t("placeMissing") : t("loading")}</p>
      </div>
    );
  }
  const name = placeName(p, l);
  const alt = altText(p, l);
  const off = p.d > 150 ? t("offTrail", { d: p.d >= 1000 ? `${fmtKm(p.d / 1000, l, 1)} km` : `${fmtInt(Math.round(p.d / 10) * 10, l)} m` }) : t("onTrail");
  const orbiting = show?.kind === "orbit" && show.id === p.id;
  const osm = p.poi && /^[nwr]\d+$/.test(p.id) ? `https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[p.id[0] as "n" | "w" | "r"]}/${p.id.slice(1)}` : null;

  const orbit = () => {
    const tm = mapApi.value;
    if (!tm) return;
    if (orbiting) { tm.stopShow(); return; }
    if (!isDesktop.value) detent.value = "peek";
    // once the sheet is down (it changes the map's framing), then fly and turn
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const stop = tm.orbit(p.c, () => { if (cameraShow.peek()?.id === p.id) cameraShow.value = null; }, { zoom: p.t === "peak" ? 12.6 : 13.2 });
      if (stop) cameraShow.value = { kind: "orbit", id: p.id, stop };
    }));
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/lieu/${encodeURIComponent(p.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: name, url }); return; }
      await navigator.clipboard.writeText(url);
      toast(t("linkCopied"));
    } catch (_) { /* cancelled */ }
  };

  return (
    <article class="place">
      <div class="dhead">
        <div class="pkind">
          <PlaceBadge kind={p.t} size={28} />
          <span>{placeKindLabel(p, l)}</span>
        </div>
        <div class="dhead__actions">
          <button class="iconbtn" type="button" aria-label={t("share")} onClick={share}><Share /></button>
          <button class="iconbtn" type="button" aria-label={t("close")} onClick={goBack}><Close /></button>
        </div>
      </div>

      <div class="view" key={p.id}>
        <h1 class="ptitle" tabIndex={-1} data-autofocus>{name}</h1>
        <p class="pmeta">
          {alt && <><span class="num">{alt}</span>{", "}</>}
          <span class="num">km {fmtKm(p.km, l, p.km < 10 ? 1 : 0)}</span>
          {p.t !== "town" && p.t !== "gap" ? `, ${off}` : ""}
        </p>

        <Relation p={p} />

        {p.t === "gap" && <p class="ptext">{t(GAP_TEXT[p.gap?.key ?? ""] ?? "gapGeneric")}</p>}

        <Facts p={p} />

        <div class="actions actions--map">
          <button class={`action${orbiting ? " is-on" : ""}`} type="button" onClick={orbit} aria-pressed={orbiting}>
            <Orbit />{orbiting ? t("stopOrbit") : t("orbit")}
          </button>
          {p.poi?.url && (
            <a class="action" href={p.poi.url} target="_blank" rel="noopener"><External />{t("docPage")}</a>
          )}
          {!p.poi?.url && osm && (
            <a class="action" href={osm} target="_blank" rel="noopener"><External />OpenStreetMap</a>
          )}
        </div>

        <NearPhotos p={p} />
        <Around p={p} />
        {p.poi && (
          <p class="fine pcredit">
            {t("osmCredit")}
            {p.poi.url && osm ? <> <a href={osm} target="_blank" rel="noopener">{t("viewOnOsm")}</a></> : null}
          </p>
        )}
      </div>
    </article>
  );
}
