// The films: "Le Te Araroa en 30 secondes" (what the trail is) and "Le kiwi et l'île" (a short anime film: a kiwi
// tramper crosses the South Island unbothered, then one step lights every marker to Bluff), in the reader's language.
// In the panel, a card; a tap opens the film over everything and plays it with its music. A phone, or a tablet held
// upright, gets the vertical cut, filling the screen; a computer, or a tablet held sideways, the 16:9 one, large in
// the middle of the map. Turning the tablet while it plays swaps the cut and keeps the place.
// Each film's four cuts, their stills and the card's picture live in public/film/ (made from its own frames): they
// stay out of the service worker's copies (a video is fetched in pieces, as it plays) and cost nothing until the tap.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import type { Lang } from "../types";
import { Close, Play } from "./icons";

const DIR = `${import.meta.env.BASE_URL}film/`;
/** a screen wide and tall enough to be a computer or a tablet held sideways (a phone held sideways stays vertical) */
const WIDE_MQ = "(orientation: landscape) and (min-width: 900px) and (min-height: 500px)";
const cut = (wide: boolean) => (wide ? "16x9" : "9x16");

type FilmId = "trail" | "kiwi";
const FILMS = {
  trail: { file: "te-araroa", poster: "poster", card: "card", dur: "0:30", title: "film", sub: "filmSub", text: "filmText" },
  kiwi: { file: "kiwi", poster: "kiwi-poster", card: "kiwi-card", dur: "0:51", title: "film2", sub: "film2Sub", text: "film2Text" },
} as const;
const filmSrc = (f: FilmId, l: Lang, wide: boolean) => `${DIR}${FILMS[f].file}-${l}-${cut(wide)}.mp4`;
const stillSrc = (f: FilmId, l: Lang, wide: boolean) => `${DIR}${FILMS[f].poster}-${l}-${cut(wide)}.jpg`;

/** Both films, side by side: the trail in 30 seconds, then the kiwi's short. */
export function Films() {
  return (
    <div class="films block">
      <FilmCard film="trail" />
      <FilmCard film="kiwi" />
    </div>
  );
}

export function FilmCard({ film = "trail" }: { film?: FilmId }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const F = FILMS[film];
  return (
    <>
      <button ref={btn} class="feature film" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span class="feature__img film__img">
          <picture><source srcset={`${DIR}${F.card}.webp`} type="image/webp" /><img src={`${DIR}${F.card}.jpg`} width={960} height={540} alt="" loading="lazy" decoding="async" /></picture>
          <span class="film__play glass" aria-hidden="true"><Play /></span>
          <span class="feature__count num" aria-hidden="true">{F.dur}</span>
        </span>
        <span class="feature__body">
          <span class="feature__title film__title">{t(F.title)}</span>
          <span class="feature__meta film__sub">{t(F.sub)}</span>
        </span>
      </button>
      {open && <FilmDialog film={film} onClose={() => { setOpen(false); btn.current?.focus(); }} />}
    </>
  );
}

function FilmDialog({ film, onClose }: { film: FilmId; onClose: () => void }) {
  const F = FILMS[film];
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
      aria-labelledby={`${film}-title`}
      aria-describedby={`${film}-text`}
      onClose={onClose}
      // a tap on the dimmed map around the film closes it (on a phone the film fills the screen: the cross does)
      onClick={(e) => { if (wide && !(e.target as Element).closest("video, button")) dialog.current?.close(); }}
    >
      <h2 id={`${film}-title`} class="sr-only">{t(F.title)}</h2>
      <p id={`${film}-text`} class="sr-only">{t(F.text)}</p>
      <div class="film-dialog__frame">
        <video
          ref={video}
          class="film-dialog__video"
          src={filmSrc(film, l, wide)}
          poster={stillSrc(film, l, wide)}
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
