import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { coverOf, dayByNumber, dayTitle, days, mediaByDay, route } from "../lib/data";
import type { Day } from "../types";
import { DayBody } from "./DayBody";
import { titleOf } from "./Home";
import { NoteToEwan } from "./NoteToEwan";
import { ChevronLeft, ChevronRight, Close, Share } from "./icons";
import { Reactions } from "./Reactions";
import { go, goBack, hrefFor, toast } from "./state";

const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(hover: none)").matches;
const HINT_KEY = "day-swipe-hint";
const hintsLeft = () => { try { return Number(localStorage.getItem(HINT_KEY) ?? 3); } catch { return 0; } };
const countHint = () => { try { localStorage.setItem(HINT_KEY, String(Math.max(0, hintsLeft() - 1))); } catch { /* private mode */ } };
const seenHint = () => { try { localStorage.setItem(HINT_KEY, "0"); } catch { /* private mode */ } };

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
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  // the swipe, said in words the first few times a day is opened on a touch screen (once it's been used, never again)
  const [hint] = useState(() => !!(prev || next) && TOUCH && hintsLeft() > 0);
  useEffect(() => { if (hint) countHint(); }, []);

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
  // a swipe across the page turns it: to the left the next day, to the right the one before (not from the screen's
  // very edges, where the phone has its own gestures, nor across the photos' own strips)
  const swipeStart = (e: TouchEvent) => {
    const p = e.touches[0];
    swipe.current = e.touches.length === 1 && p.clientX > 24 && p.clientX < window.innerWidth - 24 && !(e.target as Element).closest(".hscroll, input, textarea")
      ? { x: p.clientX, y: p.clientY, t: e.timeStamp } : null;
  };
  const swipeEnd = (e: TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    const p = e.changedTouches[0];
    if (!s || !p) return;
    const dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || e.timeStamp - s.t > 700) return;
    const to = dx < 0 ? next : prev;
    if (!to) return;
    seenHint();
    goDay(to);
  };

  return (
    <article class="day">
      <div class="dhead">
        {/* where this day stands, with the days either side (a swipe across the page does the same) */}
        <div class="seg seg--icons daynav" role="group" aria-label={t("days")}>
          <button type="button" aria-label={prev ? `${t("prevDay")} : ${t("day", { n: prev.day_number })}` : t("prevDay")} disabled={!prev} onClick={() => goDay(prev)}><ChevronLeft /></button>
          <span class="daynav__now num">{t("day", { n: d.day_number })}</span>
          <button type="button" aria-label={next ? `${t("nextDay")} : ${t("day", { n: next.day_number })}` : t("nextDay")} disabled={!next} onClick={() => goDay(next)}><ChevronRight /></button>
        </div>
        <div class="dhead__actions">
          <button class="iconbtn" type="button" aria-label={t("share")} onClick={share}><Share /></button>
          <button class="iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={goBack}><Close /></button>
        </div>
      </div>

      <div class="view" key={d.id} onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
      {hint && <p class="fine daynav__hint">{t("swipeDays")}</p>}
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
