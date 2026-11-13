// "Message vocal": a voice note for the day, recorded here (up to 3 minutes). It waits on the phone with the day and
// goes out with it (store.ts); the site plays it with the waveform drawn while recording (ui/Voice.tsx). A level meter
// moves while it records, so it is plain the microphone hears; afterwards it can be listened to, redone or removed.
import { useEffect, useRef, useState } from "preact/hooks";
import type { DayVoice } from "../types";
import { Close, Mic } from "../ui/icons";
import { VoiceNote } from "../ui/Voice";
import { say } from "./nav";
import { getBlob } from "./store";

const MAX_S = 180;
const BARS = 48;
const TYPES = ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** the loudness every tenth of a second → 48 bars between 0 and 1 (the loudest moment at full height) */
function toPeaks(levels: number[]): number[] {
  if (!levels.length) return [];
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const a = Math.floor((i * levels.length) / BARS), b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS));
    out.push(Math.max(...levels.slice(a, b)));
  }
  const top = Math.max(...out, 1e-4);
  return out.map((x) => Math.round(Math.min(1, Math.sqrt(x / top)) * 100) / 100);
}

export interface Recorded { blob: Blob; mime: string; voice: DayVoice }

/** The blob of a note not sent yet, as an address the player can read. */
function useLocalUrl(key: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) { setUrl(null); return; }
    let u: string | null = null, alive = true;
    getBlob(key).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [key]);
  return url;
}

export function VoiceRec({ voice, localKey, onRecorded, onRemove, onBusy }: {
  voice: DayVoice | null | undefined;
  localKey: string | null | undefined;
  onRecorded: (r: Recorded) => void;
  onRemove: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [rec, setRec] = useState<{ t: number; level: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** the recording under way: stop keeps the note, cancel (leaving the page) throws it away */
  const ctl = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const local = useLocalUrl(localKey);
  useEffect(() => () => ctl.current?.cancel(), []);

  const start = async () => {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setErr("L'enregistrement n'est pas possible sur cet appareil."); return; }
    // (the sound engine must be made by the tap itself on an iPhone)
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctx.resume().catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      ctx.close();
      setErr((e as Error)?.name === "NotAllowedError" ? "Autorise le micro pour ce site : Réglages › Safari › Micro (ou dans l'appli Carnet)." : "Micro introuvable.");
      return;
    }
    const mime = TYPES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    const chunks: Blob[] = [];
    const levels: number[] = [];
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let cancelled = false;
    const sample = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      levels.push(rms);
      const t = (performance.now() - t0) / 1000;
      setRec({ t, level: Math.min(1, rms * 6) });
      if (t >= MAX_S) ctl.current?.stop();
    }, 100);
    const finish = () => {
      window.clearInterval(sample);
      stream.getTracks().forEach((x) => x.stop());
      ctx.close().catch(() => {});
      ctl.current = null;
      setRec(null);
      onBusy(false);
    };
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const s = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
      finish();
      if (cancelled) return;
      if (s < 1) { say("Trop court : parle au moins une seconde."); return; }
      const type = mr.mimeType || mime || "audio/mp4";
      onRecorded({ blob: new Blob(chunks, { type }), mime: type, voice: { path: "", s, peaks: toPeaks(levels) } });
    };
    const halt = () => { if (mr.state !== "inactive") mr.stop(); };
    ctl.current = { stop: halt, cancel: () => { cancelled = true; halt(); } };
    mr.start(1000);
    onBusy(true);
    setRec({ t: 0, level: 0 });
  };
  if (rec) {
    return (
      <div class="vrec vrec--on" role="group" aria-label="Enregistrement en cours">
        <button class="vrec__stop" type="button" onClick={() => ctl.current?.stop()} aria-label="Arrêter l'enregistrement">
          <span class="vrec__square" aria-hidden="true" />
        </button>
        <span class="vrec__meter" aria-hidden="true" style={{ "--lv": rec.level.toFixed(3) }}>
          {[0.55, 0.85, 1, 0.75, 0.6].map((k) => <span style={{ "--k": k }} />)}
        </span>
        <span class="vrec__time num" role="timer" aria-live="off">{clock(rec.t)}</span>
        <span class="vrec__max">{clock(MAX_S)} max.</span>
      </div>
    );
  }
  return (
    <div class="vrec">
      {voice && (voice.path || local) ? (
        <>
          <VoiceNote voice={voice} src={local} />
          <div class="pickrow" style={{ marginTop: "10px" }}>
            <button class="btn" type="button" onClick={start}><Mic />Réenregistrer</button>
            <button class="btn danger" type="button" onClick={() => { if (confirm("Supprimer ce message vocal ?")) onRemove(); }}><Close />Supprimer</button>
          </div>
        </>
      ) : (
        <button class="btn btn--block vrec__start" type="button" onClick={start}><Mic />Enregistrer un message</button>
      )}
      {err && <p class="warn" style={{ marginTop: "8px" }}>{err}</p>}
    </div>
  );
}
