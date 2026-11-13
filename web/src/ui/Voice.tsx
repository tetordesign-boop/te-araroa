// My voice note of the day, recorded in the Carnet: a play button and the waveform, drawn from the shape stored with
// the day (nothing is downloaded before the tap). The bars fill orange as it plays; the waveform is a slider (a tap
// or a drag moves in the note, and the arrow keys by five seconds). One note plays at a time.
import { useEffect, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { t } from "../i18n";
import type { DayVoice } from "../types";
import { Pause, Play } from "./icons";

let current: HTMLAudioElement | null = null;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** a steady shape when none was stored (a note from before the waveform was kept) */
function fallback(seed: string, n: number): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Array.from({ length: n }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(h * 0.001 + i * 0.7) * Math.cos(i * 0.31)));
}

export function VoiceNote({ voice, src }: { voice: DayVoice; src?: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const wave = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = voice.s > 0 ? voice.s : 0;
  const peaks = voice.peaks?.length ? voice.peaks : fallback(voice.path, 48);
  const url = src ?? mediaUrl(voice.path);

  const tick = () => {
    const a = audio.current;
    if (!a) return;
    setAt(a.currentTime);
    raf.current = requestAnimationFrame(tick);
  };
  const el = () => {
    if (audio.current) return audio.current;
    const a = new Audio();
    a.preload = "auto";
    a.src = url;
    a.addEventListener("play", () => { setPlaying(true); cancelAnimationFrame(raf.current); tick(); });
    a.addEventListener("pause", () => { setPlaying(false); cancelAnimationFrame(raf.current); setAt(a.currentTime); });
    a.addEventListener("ended", () => { setPlaying(false); cancelAnimationFrame(raf.current); setAt(0); a.currentTime = 0; });
    a.addEventListener("error", () => { setFailed(true); setPlaying(false); });
    audio.current = a;
    return a;
  };
  // a new day (or leaving the page) stops it
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    const a = audio.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    if (current === a) current = null;
    audio.current = null;
  }, [url]);

  const toggle = () => {
    const a = el();
    if (!a.paused) { a.pause(); return; }
    if (current && current !== a) current.pause();
    current = a;
    setFailed(false);
    a.play().catch(() => setFailed(true));
  };
  const seek = (s: number) => {
    const a = el();
    const to = clamp(s, 0, total || a.duration || 0);
    a.currentTime = to;
    setAt(to);
  };
  const fromPointer = (e: PointerEvent) => {
    const r = wave.current?.getBoundingClientRect();
    if (!r || !total) return;
    seek(((e.clientX - r.left) / r.width) * total);
  };
  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    fromPointer(e);
  };
  const move = (e: PointerEvent) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) fromPointer(e); };
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -5 : 0;
    if (e.key === "Home") { e.preventDefault(); seek(0); }
    else if (e.key === "End") { e.preventDefault(); seek(total); }
    else if (step) { e.preventDefault(); seek(at + step); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  };

  const frac = total ? clamp(at / total, 0, 1) : 0;
  const lit = Math.round(frac * peaks.length);
  return (
    <div class={`vnote${playing ? " is-playing" : ""}`}>
      <button class="vnote__play" type="button" data-sfx="none" onClick={toggle}
        aria-label={playing ? t("voicePause") : t("voiceListen", { len: clock(total) })}>
        {playing ? <Pause /> : <Play />}
      </button>
      <div ref={wave} class="vnote__wave" role="slider" tabIndex={0} aria-label={t("voicePosition")}
        aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(at)}
        aria-valuetext={t("voiceOf", { t: clock(at), total: clock(total) })}
        onPointerDown={down} onPointerMove={move} onKeyDown={key}>
        {peaks.map((p, i) => <span class={`vnote__bar${i < lit ? " is-played" : ""}`} style={{ "--h": clamp(p, 0.08, 1).toFixed(3) }} />)}
      </div>
      <span class="vnote__time num" aria-hidden="true">{clock(playing || at > 0 ? at : total)}</span>
      {failed && <p class="vnote__err" role="status">{t("voiceError")}</p>}
    </div>
  );
}
