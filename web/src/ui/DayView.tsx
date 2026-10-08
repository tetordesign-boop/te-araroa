import { useEffect, useMemo, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { coverOf, dayByNumber, dayTitle, days, mediaByDay, route } from "../lib/data";
import { fmtDate, fmtDuration, fmtInt, fmtKm } from "../lib/format";
import type { Day } from "../types";
import { Gallery } from "./Gallery";
import { HutBook } from "./HutBook";
import { ChevronLeft, ChevronRight, Close, Replay, Share } from "./icons";
import { Reactions } from "./Reactions";
import { go, goBack, replayState, toast } from "./state";
import { startReplay } from "./replayControl";

function Profile({ d }: { d: Day }) {
  const p = d.track?.p;
  if (!p || p.length < 3) return null;
  const W = 340, H = 64;
  const k0 = p[0][0], k1 = p[p.length - 1][0];
  const es = p.map((x) => x[1]);
  const lo = Math.min(...es), hi = Math.max(...es);
  const span = Math.max(50, hi - lo);
  const pts = p.map(([k, e]) => [((k - k0) / Math.max(0.01, k1 - k0)) * W, H - 6 - ((e - lo) / span) * (H - 18)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const l = lang.value;
  return (
    <div class="profile" aria-label={`${fmtInt(lo, l)}–${fmtInt(hi, l)} m`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path class="profile__area" d={`${line}L${W},${H}L0,${H}Z`} />
        <path class="profile__line" d={line} vector-effect="non-scaling-stroke" />
        <text class="profile__label" x="2" y="10">{fmtInt(hi, l)} m</text>
      </svg>
    </div>
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
        {text.split(/\n{2,}/).map((para) => <p>{para}</p>)}
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
        <div class="dayhead"><button class="iconbtn" type="button" aria-label={t("back")} onClick={() => go({ name: "home" })}><ChevronLeft /></button></div>
        <p class="empty">{t("journalEmpty")}</p>
      </div>
    );
  }

  const media = mediaByDay.value.get(d.id) ?? [];
  const cover = coverOf(d);
  const km = d.distance_km ?? (d.start_km !== null && d.end_km !== null ? d.end_km - d.start_km : null);
  const title = dayTitle(d, l);
  const replaying = replayState.value?.n === d.day_number;

  const share = async () => {
    const url = `${location.origin}${location.pathname}#/jour/${d.day_number}`;
    const text = t("shareText", { title: `${t("day", { n: d.day_number })}${title ? ` : ${title}` : ""}` });
    try {
      if (navigator.share) { await navigator.share({ title: text, url }); return; }
      await navigator.clipboard.writeText(url);
      toast(t("linkCopied"));
    } catch (_) { /* cancelled */ }
  };

  return (
    <article>
      <div class="dayhead">
        <button class="iconbtn" type="button" aria-label={t("back")} onClick={goBack}><ChevronLeft /></button>
        <div class="dayhead__nav">
          <button class="iconbtn" type="button" aria-label={t("prevDay")} disabled={!prev} onClick={() => prev && go({ name: "day", n: prev.day_number }, { replace: true })}><ChevronLeft /></button>
          <button class="iconbtn" type="button" aria-label={t("nextDay")} disabled={!next} onClick={() => next && go({ name: "day", n: next.day_number }, { replace: true })}><ChevronRight /></button>
          <button class="iconbtn" type="button" aria-label={t("share")} onClick={share}><Share /></button>
        </div>
      </div>

      <div class="day__kicker">
        <strong>{t("day", { n: d.day_number })}</strong>
        <span>{fmtDate(d.date, l)}</span>
        {(d.weather || d.mood) && <span aria-hidden="true">{d.weather}{d.mood}</span>}
      </div>
      <h1 class="day__title">{title || (d.kind === "rest" ? t("rest") : t("day", { n: d.day_number }))}</h1>
      {leg && d.kind !== "rest" && <div class="day__section">{t("section")} : {leg}</div>}

      {d.kind === "rest" ? (
        <div class="stats"><div class="stat"><div class="stat__v">☕</div><div class="stat__k">{t("rest")}</div></div></div>
      ) : (
        <div class="stats" aria-label={t("dayStatsAria", { km: fmtKm(km, l), up: fmtInt(d.ascent_m, l) })}>
          {km !== null && <div class="stat"><div class="stat__v num">{fmtKm(km, l, 1)}<small>km</small></div><div class="stat__k">{d.kind === "transport" ? t("transport") : t("distance")}</div></div>}
          {d.ascent_m ? <div class="stat"><div class="stat__v num">{fmtInt(d.ascent_m, l)}<small>m</small></div><div class="stat__k">{t("ascent")}</div></div> : null}
          {d.descent_m ? <div class="stat"><div class="stat__v num">{fmtInt(d.descent_m, l)}<small>m</small></div><div class="stat__k">{t("descent")}</div></div> : null}
          {d.moving_time_min ? <div class="stat"><div class="stat__v num">{fmtDuration(d.moving_time_min, l)}</div><div class="stat__k">{t("duration")}</div></div> : null}
        </div>
      )}
      <Profile d={d} />

      <Gallery list={media} cover={cover} openId={photo} />
      <Story d={d} />

      {d.kind !== "rest" && km !== null && km > 0.3 && (
        <div class="actions">
          {replaying ? (
            <button class="btn" type="button" onClick={() => replayState.value?.stop()}><Close />{t("stopReplay")}</button>
          ) : (
            <button class="btn btn--primary" type="button" onClick={() => startReplay(d)}><Replay />{t("replay")}</button>
          )}
        </div>
      )}

      <Reactions dayId={d.id} />
      <HutBook dayId={d.id} />

      <nav class="daynav" aria-label="Jours">
        <button class="btn" type="button" disabled={!prev} onClick={() => prev && go({ name: "day", n: prev.day_number }, { replace: true })}><ChevronLeft />{t("prevDay")}</button>
        <button class="btn" type="button" disabled={!next} onClick={() => next && go({ name: "day", n: next.day_number }, { replace: true })}>{t("nextDay")}<ChevronRight /></button>
      </nav>
    </article>
  );
}
