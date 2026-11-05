// What a day's page says: its date, title, figures, photos, Ewan's story and the climb. No state of the site (no
// router, no live data): the site's day page (ui/DayView.tsx) shows it, and so does the Carnet's preview
// (admin/Preview.tsx), with photos still on the phone.
import { useEffect, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { titleOf, dayKm } from "../lib/day";
import { fmtDate, fmtDuration, fmtInt, fmtKm, typo } from "../lib/format";
import type { Day, Media } from "../types";
import { Gallery } from "./Gallery";

function Profile({ d }: { d: Day }) {
  const p = d.track?.p;
  if (!p || p.length < 3) return null;
  const W = 340, H = 76, TOP = 6, BOT = 4;
  const k0 = p[0][0], k1 = p[p.length - 1][0];
  const es = p.map((x) => x[1]);
  const lo = Math.min(...es), hi = Math.max(...es);
  const span = Math.max(60, hi - lo);
  const pts = p.map(([k, e]) => [((k - k0) / Math.max(0.01, k1 - k0)) * W, TOP + (1 - (e - lo) / span) * (H - TOP - BOT)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const l = lang.value;
  return (
    <figure class="profile" aria-label={`${t("lowest", { m: fmtInt(lo, l) })} – ${t("highest", { m: fmtInt(hi, l) })}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="profile-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--marker)", stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: "var(--marker)", stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>
        <path class="profile__area" d={`${line}L${W},${H}L0,${H}Z`} />
        <path class="profile__line" d={line} vector-effect="non-scaling-stroke" />
      </svg>
      <figcaption class="profile__axis">
        <span class="num">{t("lowest", { m: fmtInt(lo, l) })}</span>
        <span class="num">{t("highest", { m: fmtInt(hi, l) })}</span>
      </figcaption>
    </figure>
  );
}

function Figures({ d }: { d: Day }) {
  const l = lang.value;
  const km = dayKm(d);
  const items: [string, preact.ComponentChildren][] = [];
  if (km && d.kind !== "rest") items.push([d.kind === "transport" ? t("transport") : t("distance"), <>{fmtKm(km, l, 1)}<small>km</small></>]);
  if (d.ascent_m) items.push([t("ascent"), <>{fmtInt(d.ascent_m, l)}<small>m</small></>]);
  if (d.descent_m) items.push([t("descent"), <>{fmtInt(d.descent_m, l)}<small>m</small></>]);
  if (d.moving_time_min) items.push([t("duration"), fmtDuration(d.moving_time_min, l)]);
  if (!items.length) return null;
  return (
    <dl class="figures" style={{ gridTemplateColumns: `repeat(${Math.max(3, items.length)}, minmax(0, 1fr))` }}>
      {items.map(([k, v]) => <div><dt>{k}</dt><dd class="num">{v}</dd></div>)}
    </dl>
  );
}

function Story({ d }: { d: Day }) {
  const l = lang.value;
  const [translated, setTranslated] = useState<string | null>(null);
  useEffect(() => setTranslated(null), [d.id, l]);
  const useEn = l === "en" && !!d.story_en;
  const text = translated ?? (useEn ? d.story_en : d.story);
  if (!text) return null;
  const canTranslate = l === "en" && !d.story_en && !!d.story;

  const translate = async () => {
    const src = d.story ?? "";
    try {
      const T = (self as unknown as { Translator?: any }).Translator;
      if (T) {
        const avail = await T.availability({ sourceLanguage: "fr", targetLanguage: "en" });
        if (avail !== "unavailable") {
          const tr = await T.create({ sourceLanguage: "fr", targetLanguage: "en" });
          setTranslated(await tr.translate(src));
          return;
        }
      }
    } catch (_) { /* fall back */ }
    window.open(`https://translate.google.com/?sl=fr&tl=en&op=translate&text=${encodeURIComponent(src.slice(0, 4500))}`, "_blank", "noopener");
  };

  return (
    <div>
      <div class="story" lang={useEn || translated ? "en" : "fr"}>
        {text.split(/\n{2,}/).map((para) => <p>{typo(para)}</p>)}
      </div>
      {canTranslate && (
        <div class="story__translate">
          {translated
            ? <button class="textbtn" type="button" onClick={() => setTranslated(null)}>{t("original")}</button>
            : <button class="textbtn" type="button" onClick={translate}>{t("translate")}</button>}
        </div>
      )}
    </div>
  );
}

/** The day, from its date to its climb. `leg`: which stretch of trail it is on (the site's trail knows). */
export function DayBody({ d, media, cover, leg, openId }: { d: Day; media: Media[]; cover: Media | null; leg?: string | null; openId?: string }) {
  const l = lang.value;
  return (
    <>
      <div class="kicker" style={{ marginTop: "14px" }}>
        <span class="kicker__n">{t("day", { n: d.day_number })}</span>
        <span>{fmtDate(d.date, l)}</span>
        {(d.weather || d.mood) && <span aria-hidden="true">{d.weather}{d.mood ? ` ${d.mood}` : ""}</span>}
      </div>
      <h1 class="dtitle voice" tabIndex={-1} data-autofocus>{titleOf(d, l)}</h1>
      {leg && d.kind !== "rest" && <p class="dsub">{leg}</p>}

      <Figures d={d} />

      <Gallery list={media} cover={cover} openId={openId} />
      <Story d={d} />
      <Profile d={d} />
    </>
  );
}
