// The presentation, on a first visit: the whole South Island at night with a light running the trail end to end
// (the map does that, see TrailMap.introLoop), and over it the title, where Ewan is today, and a way in.
// A tap anywhere (or Enter, or Escape) goes in: the text clears, the sheet rises and the arrival plays.
import { batch } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { lang, setLang, t } from "../i18n";
import { clock, dayOnTrail, days, latestPosition, liveState, phase, progressKm, route, settings, status } from "../lib/data";
import { daysBetween, fmtKm, nzToday } from "../lib/format";
import { play } from "../lib/sound";
import { BrandMark } from "./icons";
import { arrivalDue, go, introOpen, mapApi, rememberIntro } from "./state";

/** From "About": the presentation again, and the arrival after it. */
export function replayIntro() {
  mapApi.value?.resetArrival();
  // all at once: the arrival must see the presentation open, or it would play now, underneath
  batch(() => {
    introOpen.value = true;
    arrivalDue.value = true;
    go({ name: "home" });
  });
}

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where Ewan is today, in one line (or when he leaves, or that he arrived). */
function Today() {
  const l = lang.value;
  const ph = phase.value;
  clock.value; // a new day, a new countdown
  // nothing rather than a wrong line while the news is on its way
  if (status.value === "loading" && !days.value.length) return <p class="intro__today" aria-hidden="true">{"\u00a0"}</p>;
  if (ph === "before") {
    const start = settings.value?.start_date;
    const n = start ? daysBetween(nzToday(new Date(clock.value)), start) : null;
    const text = n === null || n < 0 ? t("notStarted") : n === 0 ? t("countdownToday") : n === 1 ? t("countdownOne") : t("countdown", { n });
    return <p class="intro__today">{text}</p>;
  }
  const n = dayOnTrail.value;
  if (ph === "after") return <p class="intro__today">{t("finished", { n: n ?? "" })}</p>;
  const km = fmtKm(progressKm.value, l, 0);
  const state = latestPosition.value ? (liveState.value === "live" ? t("live") : t("lastKnown")) : null;
  const rest = n ? t("introDayKm", { n, km }) : `${km} km`;
  return (
    <p class="intro__today">
      {liveState.value === "live" && <span class="status__dot" aria-hidden="true" />}
      <span>{state ? <><strong>{state}</strong>, {rest}</> : rest[0].toUpperCase() + rest.slice(1)}</span>
    </p>
  );
}

export function Intro() {
  const l = lang.value;
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const title = settings.value?.site_title || "Te Araroa";

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    play("enter");
    rememberIntro();
    // the sheet and the controls come in while the words go
    document.documentElement.classList.remove("is-intro");
    window.setTimeout(() => { introOpen.value = false; }, still() ? 0 : 560);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("is-intro");

    // focus inside the dialog (on the dialog itself: no ring for someone who taps); Tab reaches the buttons
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") enter();
      else if ((e.key === "Enter" || e.key === " ") && document.activeElement === box.current) { e.preventDefault(); enter(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); root.classList.remove("is-intro"); };
  }, []);

  return (
    <div class={`intro${leaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-labelledby="intro-title" tabIndex={-1} ref={box}
      onClick={(e) => { if (!(e.target as HTMLElement).closest(".intro__lang")) enter(); }}>
      <div class="intro__scrim" aria-hidden="true" />
      <button class="intro__lang" type="button" lang={l === "fr" ? "en" : "fr"} onClick={() => setLang(l === "fr" ? "en" : "fr")}>
        {l === "fr" ? "English" : "Français"}
      </button>
      <div class="intro__body">
        <BrandMark class="intro__mark" />
        <h1 class="intro__title" id="intro-title">
          <span class="intro__line">{title}</span>
          <span class="intro__line">{t("introWith")}</span>
        </h1>
        <p class="intro__lede voice">{t("introLede", { km: fmtKm(route.value.total, l, 0) })}</p>
        <Today />
        <button class="intro__cta" type="button" data-sfx="none" onClick={(e) => { e.stopPropagation(); enter(); }}>
          {t("introCta")}
        </button>
      </div>
    </div>
  );
}
