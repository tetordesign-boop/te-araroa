// The photos by section: a shelf of glass folders in the journal (ui/GlassFolder.tsx), one per stretch of trail
// between two trail towns. Each folder is an album: the photos Ewan takes on that stretch file themselves in it (by
// where they were taken, lib/data.ts mediaKm), the latest one on its back panel, and a touch on one opens them all
// full screen. Before he gets there, empty frames name the places still to come. The key frames the section on the
// map; the section he is on says so on its glass, and the shelf opens on it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import { days, media, mediaKm, phase, progressKm, route } from "../lib/data";
import { fmtDate, fmtKm } from "../lib/format";
import type { LngLat } from "../lib/geo";
import { notable, places, shortStation, type Place } from "../lib/places";
import type { Day, Media } from "../types";
import { openLightbox } from "./Gallery";
import { GlassFolder, HEADROOM, type ArtRecipe, type FolderFile } from "./GlassFolder";
import { titleOf } from "./Home";
import { Camera, MapIcon } from "./icons";
import { openPlace, placeName } from "./Place";
import { detent, go, hrefFor, isDesktop, mapApi } from "./state";

/** The sections, by the trail towns that bound them (indices in the trail's places), and their light. */
const SECTIONS: { from: number; to: number; art: ArtRecipe }[] = [
  // Queen Charlotte: the sounds, sea and bush
  { from: 0, to: 1, art: { style: "marble", colors: ["#03101a", "#0a2b3a", "#0f5466", "#1d8a96", "#5cd6e6", "#c9f1f4"], scale: 0.7, warp: 3.2, angle: -0.5, gloss: 0.5, veins: 0.45 } },
  // the Richmond Range: beech forest and ridges
  { from: 1, to: 4, art: { style: "marble", colors: ["#050a07", "#12271c", "#2c5639", "#6e8c4c", "#c4c088", "#efe7cc"], scale: 0.72, warp: 3.4, angle: 2.1, gloss: 0.45, veins: 0.5 } },
  // Nelson Lakes and the Waiau Pass: alpine lakes, scree, snow
  { from: 4, to: 6, art: { style: "streak", colors: ["#081221", "#22385a", "#6f8fb8", "#cfdcec", "#ffffff", "#9cc6d8"], scale: 0.7, warp: 1.6, angle: 0.35, gloss: 0.25 } },
  // to Arthur's Pass: river valleys under the main divide
  { from: 6, to: 7, art: { style: "marble", colors: ["#0a0e18", "#1b283a", "#3c5a68", "#86a59c", "#e1d6b3", "#f6f0dc"], scale: 0.75, warp: 3.6, angle: 0.8, gloss: 0.5, veins: 0.5 } },
  // Canterbury: braided rivers and tussock
  { from: 7, to: 10, art: { style: "streak", colors: ["#0f0c09", "#3a2b18", "#8a6c36", "#d5b56e", "#f3e4b8", "#8fb0c6"], scale: 0.7, warp: 1.4, angle: -0.62, gloss: 0.2 } },
  // the Mackenzie: Tekapo, the canals, Ohau, under the dark-sky reserve
  { from: 10, to: 13, art: { style: "marble", colors: ["#030b18", "#0b2a46", "#0d7486", "#5cd6e6", "#b7f2f6", "#16123a"], scale: 0.66, warp: 3.2, angle: -0.5, gloss: 0.55, veins: 0.5 } },
  // Wānaka and the Motatapu: golden tussock above the lakes
  { from: 13, to: 16, art: { style: "marble", colors: ["#0c0907", "#3a2414", "#94602a", "#e0a957", "#fbe2b0", "#28405a"], scale: 0.72, warp: 3.4, angle: 2.4, gloss: 0.5, veins: 0.45 } },
  // Southland to Bluff: the far south, where the aurora shows
  { from: 16, to: 20, art: { style: "streak", colors: ["#04070f", "#122340", "#1b6656", "#46d79c", "#b878d0", "#eef0ff"], scale: 0.7, warp: 1.5, angle: 0.5, gloss: 0.2 } },
];

/** the kinds of place worth an empty frame, most telling first */
const KIND_RANK: Record<string, number> = { pass: 0, hut: 1, camp: 2, fall: 3, view: 4, peak: 5 };
/** prints shown in a folder (the album holds them all) */
const SHOWN = 4;

const dayMid = (d: Day): number | null => {
  if (d.start_km !== null && d.end_km !== null) return (d.start_km + d.end_km) / 2;
  return d.end_km ?? d.start_km ?? null;
};

/** a photo's picture for a print (a video's poster; an embedded video without one stays out of the folders) */
const printOf = (m: Media) => (m.kind === "photo" ? m.thumb_path ?? m.path : m.thumb_path);

/** `n` of the album spread over the whole stretch, the latest last (at the front, nearest the glass) */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const idx = new Set(Array.from({ length: n }, (_, j) => Math.round((j * (list.length - 1)) / (n - 1))));
  return [...idx].map((i) => list[i]);
}

export function TrailSections() {
  const l = lang.value;
  const r = route.value;
  const stations = r.places();
  const all = places.value;
  const list = days.value;
  const shots = media.value;
  const where = mediaKm.value;
  const ph = phase.value;
  const km = progressKm.value;
  const shelf = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const [open, setOpen] = useState<number | null>(null);

  const sections = useMemo(() => {
    const dayOf = new Map(list.map((d) => [d.id, d]));
    // in the order he took them
    const ordered = shots
      .filter((m) => dayOf.has(m.day_id) && printOf(m) && where.has(m.id))
      .sort((a, b) => dayOf.get(a.day_id)!.day_number - dayOf.get(b.day_id)!.day_number
        || (a.taken_at ?? "").localeCompare(b.taken_at ?? "") || a.sort - b.sort);
    return SECTIONS.flatMap((s, i) => {
      const a = stations[s.from], b = stations[s.to];
      if (!a || !b) return [];
      const k0 = a.km, k1 = b.km, last = i === SECTIONS.length - 1;
      const inside = (x: number) => x >= k0 && (last ? x <= k1 + 0.5 : x < k1);
      const sDays = list.filter((d) => { const m = dayMid(d); return m !== null && inside(m); });
      const sPlaces = all.filter((p) => p.t !== "town" && p.t !== "gap" && notable(p) && inside(p.km));
      const album = ordered.filter((m) => inside(where.get(m.id)!));
      return [{ i, k0, k1, art: s.art, label: `${shortStation(a.n)} – ${shortStation(b.n)}`, days: sDays, places: sPlaces, album, dayOf }];
    });
  }, [stations, all, list, shots, where]);

  const here = ph === "during" ? sections.findIndex((s) => km >= s.k0 && km < s.k1) : -1;
  const anyPhoto = sections.some((s) => s.album.length > 0);

  // the folders fill the shelf, with a glimpse of the next one
  useLayoutEffect(() => {
    const el = shelf.current;
    if (!el) return;
    const fit = () => setWidth(Math.round(Math.min(300, Math.max(214, el.clientWidth - 2 * gutterOf(el) - 44))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // open the shelf on the section Ewan is on
  useEffect(() => {
    const el = shelf.current;
    if (!el || here <= 0) return;
    const f = el.children[here] as HTMLElement | undefined;
    if (f) el.scrollLeft = f.offsetLeft - gutterOf(el);
  }, [here >= 0, sections.length]);

  const k = width / 340;

  const frame = (k0: number, k1: number) => {
    const cs: LngLat[] = [];
    for (let i = 0; i <= 30; i++) cs.push(r.pointAt(k0 + ((k1 - k0) * i) / 30));
    if (!isDesktop.peek()) detent.value = "peek"; // the map, then, with the sheet out of the way
    // (after the sheet has moved: the framing uses the new free part of the map)
    requestAnimationFrame(() => requestAnimationFrame(() => { mapApi.value?.showStretch(k0, k1); mapApi.value?.fitPlaces(cs); }));
  };

  /** empty frames for the places of a stretch still to walk (from `from` on), the most telling first */
  const soon = (ps: Place[], from: number, n: number): FolderFile[] =>
    [...ps]
      .filter((p) => p.km >= from)
      .sort((a, b) => (KIND_RANK[a.t] ?? 9) - (KIND_RANK[b.t] ?? 9) || a.km - b.km)
      .slice(0, n)
      .sort((a, b) => b.km - a.km) // (the nearest in front)
      .map((p) => ({
        key: p.id,
        name: placeName(p, l),
        meta: `km ${fmtKm(p.km, l, 0)}`,
        pending: true,
        body: <><Camera /><span>{t("photoSoon")}</span></>,
        label: t("photoSoonAt", { place: placeName(p, l) }),
        href: `#/lieu/${encodeURIComponent(p.id)}`,
        onSelect: () => openPlace(p.id),
      }));

  return (
    <section class="block">
      <h2 class="h-section shelf-head">{t("sectionsTitle")}</h2>
      <div class="hscroll shelf" ref={shelf} style={{ marginTop: `${-(HEADROOM * k - 14)}px` }}>
        {sections.map((s, n) => {
          const kmText = fmtKm(s.k1 - s.k0, l, 0);
          const photos = s.album.length;
          const videos = s.album.filter((m) => m.kind !== "photo").length;
          const count = photos === 1 ? t("photoOne") : videos ? t("mediaN", { n: photos }) : t("photosN", { n: photos });
          const meta = photos
            ? t("sectionDays", { km: kmText, days: count })
            : s.days.length
              ? t("sectionDays", { km: kmText, days: s.days.length === 1 ? t("dayOne") : t("daysN", { n: s.days.length }) })
              : t("sectionSoon", { km: kmText });
          let files: FolderFile[];
          if (photos) {
            const labels = s.album.map((m) => {
              const d = s.dayOf.get(m.day_id)!;
              return `${t("day", { n: d.day_number })}, ${fmtDate(d.date, l, { day: "numeric", month: "long" })}`;
            });
            const prints: FolderFile[] = spread(s.album, SHOWN).map((m) => {
              const d = s.dayOf.get(m.day_id)!;
              const at = s.album.indexOf(m);
              return {
                key: m.id,
                name: t("day", { n: d.day_number }),
                meta: fmtDate(d.date, l, { day: "numeric", month: "short" }),
                image: mediaUrl(printOf(m)),
                video: m.kind !== "photo",
                label: `${labels[at]}${m.caption ? `, ${(l === "en" && m.caption_en) || m.caption}` : ""}`,
                href: hrefFor({ name: "day", n: d.day_number, photo: m.id }),
                onSelect: () => openLightbox(s.album, at, labels),
              };
            });
            // on the stretch he's walking, the frames still empty wait behind his photos
            files = n === here && prints.length < SHOWN ? [...soon(s.places, km, SHOWN - prints.length), ...prints] : prints;
          } else if (s.days.length) {
            // walked, but no photo kept from it: his days, as sheets
            files = s.days.slice(-SHOWN).map((d) => ({
              key: d.id,
              name: t("day", { n: d.day_number }),
              meta: fmtDate(d.date, l, { day: "numeric", month: "short" }),
              body: <><span class="gf-paper__title">{titleOf(d, l)}</span><Lines /></>,
              href: hrefFor({ name: "day", n: d.day_number }),
              onSelect: () => go({ name: "day", n: d.day_number }),
            }));
          } else {
            files = soon(s.places, n === here ? km : -Infinity, SHOWN);
          }
          const latest = s.album[s.album.length - 1];
          return (
            <GlassFolder key={s.i}
              label={s.label} meta={meta}
              flag={n === here ? <><span class="status__dot" aria-hidden="true" />{t("sectionHere")}</> : undefined}
              art={s.art} seed={s.i * 7 + 3}
              image={latest ? mediaUrl(printOf(latest)) : undefined}
              files={files}
              keyIcon={<MapIcon />} keyLabel={t("sectionOnMap", { label: s.label })} onKey={() => frame(s.k0, s.k1)}
              open={open === s.i} onOpenChange={(o) => setOpen(o ? s.i : null)}
              openLabel={t("sectionOpen", { label: s.label, meta })} closeLabel={t("sectionClose", { label: s.label })}
              width={width} appearDelay={Math.min(n, 2) * 120} />
          );
        })}
      </div>
      <p class="fine shelf__note">{anyPhoto ? t("sectionsNote") : t("sectionsNoteSoon")}</p>
    </section>
  );
}

const Lines = () => <span class="gf-paper__lines" aria-hidden="true"><i style={{ width: "86%" }} /><i style={{ width: "64%" }} /><i style={{ width: "78%" }} /></span>;

function gutterOf(el: HTMLElement) {
  return parseFloat(getComputedStyle(el).paddingLeft) || 20;
}
