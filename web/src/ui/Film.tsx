// "Le Te Araroa en 30 secondes": the little film that says what the trail is, in the reader's language.
// In the panel, a card; a tap opens the film over everything and plays it with its music. A phone, or a tablet held
// upright, gets the vertical cut, filling the screen; a computer, or a tablet held sideways, the 16:9 one, large in
// the middle of the map. Turning the tablet while it plays swaps the cut and keeps the place.
// The four films, their stills and the card's picture live in public/film/ (made from the film's own frames): they
// stay out of the service worker's copies (a video is fetched in pieces, as it plays) and cost nothing until the tap.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import type { Lang } from "../types";
import { Close, Play } from "./icons";

const DIR = `${import.meta.env.BASE_URL}film/`;
/** a screen wide and tall enough to be a computer or a tablet held sideways (a phone held sideways stays vertical) */
const WIDE_MQ = "(orientation: landscape) and (min-width: 900px) and (min-height: 500px)";
const cut = (wide: boolean) => (wide ? "16x9" : "9x16");
const filmSrc = (l: Lang, wide: boolean) => `${DIR}te-araroa-${l}-${cut(wide)}.mp4`;
const stillSrc = (l: Lang, wide: boolean) => `${DIR}poster-${l}-${cut(wide)}.jpg`;

export function FilmCard() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} class="feature film" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span class="feature__img film__img">
          <img src={`${DIR}card.jpg`} width={960} height={540} alt="" loading="lazy" decoding="async" />
          <span class="film__play glass" aria-hidden="true"><Play /></span>
          <span class="feature__count num" aria-hidden="true">0:30</span>
        </span>
        <span class="feature__body">
          <span class="feature__title film__title">{t("film")}</span>
          <span class="feature__meta film__sub">{t("filmSub")}</span>
        </span>
      </button>
      {open && <FilmDialog onClose={() => { setOpen(false); btn.current?.focus(); }} />}
    </>
  );
}

function FilmDialog({ onClose }: { onClose: () => void }) {
  const l = lang.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_MQ).matches);
  const resume = useRef<{ at: number; playing: boolean } | null>(null);

  useLayoutEffect(() => {
    const d = dialog.current!;
    d.showModal();
    // with its music: the tap that opened it allows it; if the browser still says no, its own play button is there
    video.current?.play().catch(() => {});
    return () => { if (d.open) d.close(); };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(WIDE_MQ);
    const turned = (e: MediaQueryListEvent) => {
      const v = video.current;
      resume.current = v ? { at: v.currentTime, playing: !v.paused } : null;
      setWide(e.matches);
    };
    mq.addEventListener("change", turned);
    return () => mq.removeEventListener("change", turned);
  }, []);

  const loaded = () => {
    const v = video.current, r = resume.current;
    if (!v || !r) return;
    resume.current = null;
    v.currentTime = r.at;
    if (r.playing) v.play().catch(() => {});
  };

  return (
    <dialog
      ref={dialog}
      class={`film-dialog${wide ? " is-wide" : ""}`}
      aria-labelledby="film-title"
      aria-describedby="film-text"
      onClose={onClose}
      // a tap on the dimmed map around the film closes it (on a phone the film fills the screen: the cross does)
      onClick={(e) => { if (wide && !(e.target as Element).closest("video, button")) dialog.current?.close(); }}
    >
      <h2 id="film-title" class="sr-only">{t("film")}</h2>
      <p id="film-text" class="sr-only">{t("filmText")}</p>
      <div class="film-dialog__frame">
        <video
          ref={video}
          class="film-dialog__video"
          src={filmSrc(l, wide)}
          poster={stillSrc(l, wide)}
          controls
          playsInline
          preload="auto"
          onLoadedMetadata={loaded}
        />
      </div>
      <button class="film-dialog__close topbtn glass" type="button" data-sfx="close" aria-label={t("filmClose")} onClick={() => dialog.current?.close()}>
        <Close />
      </button>
    </dialog>
  );
}
