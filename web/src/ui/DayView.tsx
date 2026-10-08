import { useEffect, useMemo, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { coverOf, dayByNumber, days, mediaByDay, route } from "../lib/data";
import { fmtDate, fmtDuration, fmtInt, fmtKm, typo } from "../lib/format";
import type { Day } from "../types";
import { Gallery } from "./Gallery";
import { dayKm, titleOf } from "./Home";
import { HutBook } from "./HutBook";
import { ChevronLeft, ChevronRight, Close, Share } from "./icons";
import { Reactions } from "./Reactions";
import { go, goBack, hrefFor, toast } from "./state";

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
  if (km !== null) items.push([d.kind === "transport" ? t("transport") : t("distance"), <>{fmtKm(km, l, 1)}<small>km</small></>]);
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

function PagerItem({ d, dir }: { d: Day; dir: "prev" | "next" }) {
  const l = lang.value;
  return (
    <a class={`pager__item${dir === "next" ? " pager__item--next" : ""}`} href={hrefFor({ name: "day", n: d.day_number })}
      onClick={(e) => { e.preventDefault(); go({ name: "day", n: d.day_number }, { replace: true }); }}>
      <span class="pager__dir">
        {dir === "prev" && <ChevronLeft />}{t("day", { n: d.day_number })}{dir === "next" && <ChevronRight />}
      </span>
      <span class="pager__title voice">{titleOf(d, l)}</span>
    </a>
  );
}

export function DayView({ n, photo }: { n: number; photo?: string }) {
  const l = lang.value;
  const d = dayByNumber.value.get(n);
  const list = days.value;
  const idx = d ? list.findIndex((x) => x.id === d.id) : -1;
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const leg = useMemo(() => (d && d.start_km !== null ? route.value.legAt(d.start_km + 0.2) : null), [d?.id, route.value]);

  if (!d) {
    return (
      <div>
        <div class="dhead"><span /><button class="iconbtn" type="button" aria-label={t("close")} onClick={goBack}><Close /></button></div>
        <p class="empty" style={{ marginTop: "12px" }}>{t("journalEmpty")}</p>
      </div>
    );
  }

  const media = mediaByDay.value.get(d.id) ?? [];
  const cover = coverOf(d);
  const title = titleOf(d, l);

  const share = async () => {
    const url = `${location.origin}${location.pathname}#/jour/${d.day_number}`;
    const text = t("shareText", { title: `${t("day", { n: d.day_number })}${title ? ` : ${title}` : ""}` });
    try {
      if (navigator.share) { await navigator.share({ title: text, url }); return; }
      await navigator.clipboard.writeText(url);
      toast(t("linkCopied"));
    } catch (_) { /* cancelled */ }
  };
  const goDay = (x: Day | null) => x && go({ name: "day", n: x.day_number }, { replace: true });

  return (
    <article class="day">
      <div class="dhead">
        <div class="seg seg--icons" role="group" aria-label={t("days")}>
          <button type="button" aria-label={t("prevDay")} disabled={!prev} onClick={() => goDay(prev)}><ChevronLeft /></button>
          <button type="button" aria-label={t("nextDay")} disabled={!next} onClick={() => goDay(next)}><ChevronRight /></button>
        </div>
        <div class="dhead__actions">
          <button class="iconbtn" type="button" aria-label={t("share")} onClick={share}><Share /></button>
          <button class="iconbtn" type="button" aria-label={t("close")} onClick={goBack}><Close /></button>
        </div>
      </div>

      <div class="kicker" style={{ marginTop: "14px" }}>
        <span class="kicker__n">{t("day", { n: d.day_number })}</span>
        <span>{fmtDate(d.date, l)}</span>
        {(d.weather || d.mood) && <span aria-hidden="true">{d.weather}{d.mood ? ` ${d.mood}` : ""}</span>}
      </div>
      <h1 class="dtitle voice">{title}</h1>
      {leg && d.kind !== "rest" && <p class="dsub">{leg}</p>}

      <Figures d={d} />

      <Gallery list={media} cover={cover} openId={photo} />
      <Story d={d} />
      <Profile d={d} />

      <Reactions dayId={d.id} />
      <div class="block"><HutBook dayId={d.id} /></div>

      {(prev || next) && (
        <nav class="pager" aria-label={t("days")}>
          {prev ? <PagerItem d={prev} dir="prev" /> : <span />}
          {next ? <PagerItem d={next} dir="next" /> : <span />}
        </nav>
      )}
    </article>
  );
}
