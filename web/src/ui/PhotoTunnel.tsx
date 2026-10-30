// "Le voyage en photos": Ewan's photos, day after day, coming toward you out of the night, after "Perspective
// Tunnel Hero" (21st.dev), rewritten for the site without its animation library. You walk into the trip: a swipe
// up (a scroll, the arrow keys) moves you forward; the photos come from the far end of the trail, pass through the
// plane of the title, which says which day you are in, and fly past. A tap on a photo opens it in its day. The
// line of the trail runs to the vanishing point. Its own address (#/voyage), so the back gesture closes it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import { days, mediaByDay, status } from "../lib/data";
import { fmtDate, fmtKm } from "../lib/format";
import { play } from "../lib/sound";
import type { Day, Media } from "../types";
import { dayKm, titleOf } from "./Home";
import { Close } from "./icons";
import { closeTunnel, leaveTunnelFor } from "./state";

type Card = { m: Media; d: Day; src: string; ax: number; ay: number; fx: number; fy: number; rz: number };

/** every photo and video of the trip, in order, placed round the tunnel on a golden-angle spiral */
function cardsOf(list: Day[], byDay: Map<string, Media[]>): Card[] {
  const out: Card[] = [];
  for (const d of list) {
    for (const m of byDay.get(d.id) ?? []) {
      const path = m.kind === "photo" ? m.thumb_path ?? m.path : m.thumb_path;
      if (!path) continue; // (an embedded video without a picture)
      const i = out.length, a = i * 137.5 * (Math.PI / 180);
      out.push({ m, d, src: mediaUrl(path), ax: Math.cos(a), ay: Math.sin(a), fx: 0.3 + (i % 3) * 0.07, fy: 0.22 + (i % 2) * 0.07, rz: (i % 2 ? -1 : 1) * (2.5 + (i % 5) * 1.6) });
    }
  }
  return out;
}

/** the night sky behind: a few hundred stars, the same every time */
const STARS = (() => {
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let out = "";
  for (let i = 0; i < 260; i++) {
    const big = r() > 0.93;
    out += `<circle cx="${(r() * 1000).toFixed(1)}" cy="${(r() * 1000).toFixed(1)}" r="${(big ? 1.6 + r() : 0.6 + r() * 0.8).toFixed(2)}" opacity="${(0.25 + r() * (big ? 0.6 : 0.45)).toFixed(2)}"/>`;
  }
  return out;
})();

const AHEAD = 7; // how many photos are on their way at once
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PhotoTunnel() {
  const l = lang.value;
  const cards = useMemo(() => cardsOf(days.value, mediaByDay.value), [days.value, mediaByDay.value]);
  const n = cards.length;
  const root = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, HTMLElement>());
  const st = useRef({
    p: reduce() ? 0 : -2.4, target: 0, raf: 0, last: 0,
    px: 0, py: 0, tx: 0, ty: 0, // the pointer's parallax, smoothed
    w: window.innerWidth, h: window.innerHeight, base: -99, cur: -1,
  });
  const [base, setBase] = useState(0); // which photos are mounted: from base - 1 to base + AHEAD
  const [cur, setCur] = useState(0); // the photo in the plane of the title
  const [moved, setMoved] = useState(false);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);

  const clamp = (x: number) => Math.max(0, Math.min(n - 1, x));

  /** where each mounted photo is, for the progress p (photos from the start, fractional) */
  const place = () => {
    const s = st.current;
    const mobile = s.w < 700;
    const spacing = mobile ? 230 : 300, persp = mobile ? 900 : 1200, pan = mobile ? 18 : 42;
    for (const [i, el] of els.current) {
      const c = cards[i];
      if (!c) continue;
      const r = i - s.p; // > 0: still ahead, in the distance; < 0: flying past
      const z = r >= 0 ? -r * spacing : -r * spacing * 2.6;
      const vis = r < AHEAD - 0.2 && z < persp * 0.8;
      const fadeIn = Math.min(1, Math.max(0, (AHEAD - 0.4 - r) / 1.4));
      const fadeOut = r < -0.25 ? Math.max(0, 1 - (-0.25 - r) / 0.6) : 1;
      const x = c.ax * s.w * c.fx - s.px * pan, y = c.ay * s.h * c.fy - s.py * pan;
      el.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), ${z.toFixed(1)}px) rotateZ(${c.rz}deg)`;
      el.style.opacity = vis ? (fadeIn * fadeOut).toFixed(3) : "0";
      el.style.visibility = vis && fadeIn * fadeOut > 0.01 ? "visible" : "hidden";
      el.style.pointerEvents = vis && r > -0.3 ? "auto" : "none";
    }
    const b = Math.floor(s.p), c = Math.round(clamp(s.p));
    if (b !== s.base) { s.base = b; setBase(b); }
    if (c !== s.cur) { s.cur = c; setCur(c); }
    root.current?.style.setProperty("--tun-p", n > 1 ? String(Math.max(0, Math.min(1, s.p / (n - 1)))) : "1");
  };

  const loop = () => {
    const s = st.current;
    if (s.raf) return;
    s.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - s.last) / 1000);
      s.last = now;
      const k = reduce() ? 1 : 1 - Math.exp(-dt * 7);
      s.p += (s.target - s.p) * k;
      s.px += (s.tx - s.px) * (1 - Math.exp(-dt * 5));
      s.py += (s.ty - s.py) * (1 - Math.exp(-dt * 5));
      if (Math.abs(s.target - s.p) < 0.0005) s.p = s.target;
      place();
      const busy = s.p !== s.target || Math.abs(s.tx - s.px) > 0.001 || Math.abs(s.ty - s.py) > 0.001;
      s.raf = busy ? requestAnimationFrame(tick) : 0;
    };
    s.raf = requestAnimationFrame(tick);
  };
  const goTo = (x: number) => {
    const s = st.current;
    s.target = clamp(x);
    if (!moved && Math.abs(s.target) > 0.05) setMoved(true);
    loop();
  };

  useLayoutEffect(() => { place(); });

  useEffect(() => {
    const el = root.current!;
    const s = st.current;
    document.documentElement.classList.add("is-tunnel");
    el.focus({ preventScroll: true });
    loop(); // the photos fly in to the first one
    const resize = () => { s.w = window.innerWidth; s.h = window.innerHeight; place(); };
    window.addEventListener("resize", resize);
    // a wheel or a trackpad moves through the trip (and nothing else scrolls)
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * s.h : e.deltaY;
      goTo(s.target + d * 0.004);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    // a finger: up to go forward, with the speed it leaves at
    let drag: { y: number; t0: number; from: number; samples: [number, number][]; moved: boolean; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".tun__close, .tun__bar")) return;
      drag = { y: e.clientY, t0: s.target, from: s.target, samples: [[e.clientY, e.timeStamp]], moved: false, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !drag) {
        s.tx = (e.clientX / s.w - 0.5) * 2;
        s.ty = (e.clientY / s.h - 0.5) * 2;
        if (!reduce()) loop();
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dy = drag.y - e.clientY;
      if (!drag.moved && Math.abs(dy) < 8) return;
      if (!drag.moved) { drag.moved = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }
      drag.samples.push([e.clientY, e.timeStamp]);
      if (drag.samples.length > 6) drag.samples.shift();
      goTo(drag.from + dy / 120);
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.id !== e.pointerId || !d.moved) return;
      const a = d.samples[0], b = d.samples[d.samples.length - 1];
      const v = b[1] - a[1] > 0 && e.timeStamp - b[1] < 120 ? (a[0] - b[0]) / (b[1] - a[1]) : 0; // px/ms, + = up
      goTo(s.target + v * 2.2); // a flick carries on
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", () => { drag = null; });
    return () => {
      document.documentElement.classList.remove("is-tunnel");
      window.removeEventListener("resize", resize);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  const open = (i: number) => {
    const c = cards[i];
    if (!c) return;
    play("open");
    leaveTunnelFor({ name: "day", n: c.d.day_number, photo: c.m.id });
  };

  const onKey = (e: KeyboardEvent) => {
    const s = st.current;
    if (e.key === "Escape") { e.preventDefault(); closeTunnel(); return; }
    const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, " ": 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (step) { e.preventDefault(); goTo(Math.round(s.target) + step); return; }
    if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(n - 1); }
    else if (e.key === "Enter" && e.target === root.current) { e.preventDefault(); open(cur); }
  };

  const c = cards[cur];
  const mounted: number[] = [];
  for (let i = Math.max(0, base - 1); i <= Math.min(n - 1, base + AHEAD); i++) mounted.push(i);
  const km = c ? dayKm(c.d) : null;

  return (
    <div class="tun" ref={root} role="dialog" aria-modal="true" aria-label={t("voyageTitle")} tabIndex={-1} onKeyDown={onKey}>
      <div class="tun__sky" aria-hidden="true" />
      <svg class="tun__stars" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: STARS }} />
      {/* the trail, running to the vanishing point */}
      <svg class="tun__trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="tun-trail" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color="#FF6B12" stop-opacity="0.9" />
            <stop offset="1" stop-color="#FF6B12" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="M50 101 C 44 82, 57 66, 50 47" stroke="url(#tun-trail)" />
      </svg>
      <div class="tun__rings" aria-hidden="true"><span /><span /><span /></div>

      <div class="tun__space">
        {mounted.map((i) => {
          const cd = cards[i];
          return (
            <button key={cd.m.id} type="button" class="tun__card" tabIndex={-1} aria-hidden="true" data-sfx="none"
              ref={(el) => { if (el) els.current.set(i, el); else els.current.delete(i); }}
              onClick={() => open(i)}>
              <img src={cd.src} alt="" draggable={false} decoding="async" />
              {cd.m.kind === "video" && <span class="tun__play" />}
              <span class="tun__label">{t("day", { n: cd.d.day_number })}</span>
            </button>
          );
        })}
      </div>

      {/* which day you are in: over the photos, so it always reads */}
      <div class="tun__scrim" aria-hidden="true" />
      {!n && status.value !== "loading" && <p class="tun__here tun__empty">{t("voyageEmpty")}</p>}
      {c && (
        <div class="tun__here" key={c.d.id} aria-live="polite">
          <span class="tun__day">{t("day", { n: c.d.day_number })}</span>
          <span class="tun__title voice">{titleOf(c.d, l)}</span>
          <span class="tun__meta">
            {fmtDate(c.d.date, l, { weekday: "long", day: "numeric", month: "long" })}
            {c.d.kind === "rest" ? `, ${t("rest").toLowerCase()}` : km ? <>, <span class="num">{fmtKm(km, l, 0)} km</span></> : null}
          </span>
        </div>
      )}

      <button class="tun__close iconbtn" type="button" data-sfx="close" aria-label={t("close")} onClick={closeTunnel}><Close /></button>

      {n > 0 && <div class="tun__foot">
        <p class={`tun__hint${moved ? " is-gone" : ""}`} aria-hidden={moved}>{touch ? t("voyageHintTouch") : t("voyageHint")}</p>
        <div class="tun__bar" role="slider" tabIndex={0} aria-label={t("voyageTitle")} aria-valuemin={1} aria-valuemax={n} aria-valuenow={cur + 1}
          aria-valuetext={t("voyageOf", { i: cur + 1, n })}
          onPointerDown={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            goTo(((e.clientX - r.left) / r.width) * (n - 1));
          }}>
          <span class="tun__fill" />
        </div>
        <p class="tun__count num">{t("voyageOf", { i: cur + 1, n })}</p>
      </div>}
    </div>
  );
}
