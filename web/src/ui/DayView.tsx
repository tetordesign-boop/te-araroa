import { useMemo } from "preact/hooks";
import { lang, t } from "../i18n";
import { coverOf, dayByNumber, dayTitle, days, mediaByDay, route } from "../lib/data";
import type { Day } from "../types";
import { DayBody } from "./DayBody";
import { titleOf } from "./Home";
import { NoteToEwan } from "./NoteToEwan";
import { ChevronLeft, ChevronRight, Close, Share } from "./icons";
import { Reactions } from "./Reactions";
import { go, goBack, hrefFor, toast } from "./state";

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
        <div class="dhead"><span /><button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={goBack}><Close /></button></div>
        {/* (a link to a day that isn't there: the journal has started, or not) */}
        <p class="empty" style={{ marginTop: "12px" }}>{list.length ? t("dayMissing", { n }) : t("journalEmpty")}</p>
      </div>
    );
  }

  const media = mediaByDay.value.get(d.id) ?? [];
  const cover = coverOf(d);

  const share = async () => {
    const url = `${location.origin}${location.pathname}#/jour/${d.day_number}`;
    const real = dayTitle(d, l);
    // "Jour 12 : St Arnaud." / "Day 12: St Arnaud." (no full stop after Ewan's own ! or ?)
    const head = `${t("day", { n: d.day_number })}${real ? `${l === "fr" ? "\u202f: " : ": "}${real}` : ""}`;
    const text = t("shareText", { title: /[.!?…]$/.test(head) ? head : `${head}.` });
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
          <button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={goBack}><Close /></button>
        </div>
      </div>

      <div class="view" key={d.id}>
      <DayBody d={d} media={media} cover={cover} leg={leg} openId={photo} />

      <Reactions dayId={d.id} />
      <div class="block"><NoteToEwan dayId={d.id} /></div>

      {(prev || next) && (
        <nav class="pager" aria-label={t("days")}>
          {prev ? <PagerItem d={prev} dir="prev" /> : <span />}
          {next ? <PagerItem d={next} dir="next" /> : <span />}
        </nav>
      )}
      </div>
    </article>
  );
}
