// The bottom sheet on phones (a floating panel on computers). It follows the finger directly (no re-render
// while dragging), settles with a spring that carries the flick's speed, rubber-bands past its ends, and can
// be pulled down from its content once that is scrolled to the top, like the sheets in iOS.
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../i18n";
import { play } from "../lib/sound";
import { detent, isDesktop, mapApi, type Detent } from "./state";

const PEEK = 236;
const ORDER: Detent[] = ["full", "half", "peek"];
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Sheet({ children, label, inert }: { children: ComponentChildren; label: string; inert?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const geo = useRef({ sheetH: window.innerHeight - 90, vh: window.innerHeight });
  const anim = useRef({ y: Number.NaN, v: 0, target: 0, raf: 0, dragging: false, justDragged: false, flickV: 0 });
  const current = detent.value;

  const heights = () => {
    const { sheetH, vh } = geo.current;
    const peek = Math.min(PEEK, sheetH * 0.5);
    const half = Math.min(sheetH, Math.max(peek + 90, Math.round(vh * 0.55)));
    return { peek, half, full: sheetH };
  };
  const yFor = (d: Detent) => geo.current.sheetH - heights()[d];

  /** Put the sheet at y (px down from fully open) and tell the floating buttons where its top is. */
  const place = (y: number) => {
    const el = ref.current;
    if (!el) return;
    anim.current.y = y;
    el.style.transform = isDesktop.value ? "" : `translate3d(0, ${y.toFixed(1)}px, 0)`;
    const visible = isDesktop.value ? 0 : Math.max(0, geo.current.sheetH - y);
    document.documentElement.style.setProperty("--sheet-visible", `${visible.toFixed(0)}px`);
  };

  /** Spring to a detent, starting with the speed the finger left it at (px/ms). */
  const settle = (to: Detent, velocity = 0) => {
    const a = anim.current;
    cancelAnimationFrame(a.raf);
    a.target = yFor(to);
    if (reduceMotion() || !Number.isFinite(a.y)) { place(a.target); return; }
    a.v = velocity * 1000; // px/s
    let last = 0;
    const k = 420, c = 2 * Math.sqrt(k) * 0.86; // a touch under critical: lands with a whisper of overshoot
    const step = (now: number) => {
      // real elapsed time, integrated in small steps: the spring takes the same time on a busy phone
      let left = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60;
      last = now;
      let y = a.y;
      while (left > 0) {
        const dt = Math.min(0.008, left);
        left -= dt;
        a.v += (-k * (y - a.target) - c * a.v) * dt;
        y += a.v * dt;
      }
      if (Math.abs(y - a.target) < 0.4 && Math.abs(a.v) < 12) { place(a.target); return; }
      place(y);
      a.raf = requestAnimationFrame(step);
    };
    a.raf = requestAnimationFrame(step);
  };

  // measure, and follow the detent signal (navigation and buttons change it too)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      geo.current = { sheetH: el.offsetHeight, vh: window.innerHeight };
      if (!anim.current.dragging) { cancelAnimationFrame(anim.current.raf); place(yFor(detent.peek())); }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useLayoutEffect(() => {
    if (anim.current.dragging) return;
    const v = anim.current.flickV; // the speed of the flick that chose this height, if one did
    anim.current.flickV = 0;
    settle(current, v);
  }, [current, isDesktop.value]);

  // tell the map how much of it is covered (it frames new things in the visible part; the picture itself stays put)
  useLayoutEffect(() => {
    const { vh } = geo.current;
    const visible = heights()[current];
    mapApi.value?.setPadding(isDesktop.value
      ? { left: 440, bottom: 40, top: 90, right: 70 }
      : { left: 24, right: 70, top: 84, bottom: Math.min(visible, vh * 0.62) + 20 });
  }, [current, isDesktop.value, mapApi.value]);

  useEffect(() => {
    if (current !== "full" && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [current]);

  // ---------------------------------------------------------------- dragging
  useEffect(() => {
    const el = ref.current, body = bodyRef.current;
    if (!el || !body) return;
    let drag: { y0: number; start: number; moved: boolean; id: number | "touch"; onGrip: boolean; samples: [number, number][]; slop: number } | null = null;

    const clampWithRubber = (y: number) => {
      const top = 0, bottom = yFor("peek");
      if (y < top) return top - Math.sqrt(top - y) * 4; // pulled above full: resists
      if (y > bottom) return bottom + Math.sqrt(y - bottom) * 6; // pushed below peek: resists
      return y;
    };
    // times are the events' own (when the finger moved), not when a busy page got round to handling them
    // how far a press may wander and still be a tap: a fingertip wobbles more than a mouse
    const begin = (y0: number, id: number | "touch", onGrip: boolean, ts: number, finger = true) => {
      cancelAnimationFrame(anim.current.raf);
      drag = { y0, start: Number.isFinite(anim.current.y) ? anim.current.y : yFor(detent.peek()), moved: false, id, onGrip, samples: [[y0, ts]], slop: finger ? 10 : 5 };
    };
    const move = (y: number, ts: number): boolean => {
      if (!drag) return false;
      const dy = y - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dy) < drag.slop) return false;
        drag.moved = true;
        drag.y0 += Math.sign(dy) * drag.slop;
        anim.current.dragging = true;
        el.classList.add("is-dragging");
      }
      drag.samples.push([y, ts]);
      if (drag.samples.length > 8) drag.samples.shift();
      place(clampWithRubber(drag.start + (y - drag.y0)));
      return true;
    };
    const end = (tapTarget: EventTarget | null, ts: number) => {
      const d = drag;
      drag = null;
      if (!d) return;
      if (!d.moved) {
        if (!tapTarget) return; // cancelled (the browser took the gesture): nothing happened
        // a tap: on the grip it cycles the heights; on the empty part of a low sheet it opens it a bit more
        const cur = detent.peek();
        if (d.onGrip) { detent.value = cur === "peek" ? "half" : cur === "half" ? "full" : "half"; play("snap"); }
        else if (cur === "peek" && !(tapTarget as HTMLElement).closest?.("a,button,input,textarea,label,[role=button]")) { detent.value = "half"; play("snap"); }
        return;
      }
      anim.current.dragging = false;
      anim.current.justDragged = true;
      window.setTimeout(() => { anim.current.justDragged = false; }, 60);
      el.classList.remove("is-dragging");
      // speed over the last ~100 ms (at least the last two moves, when the phone was busy), then where it would carry the sheet
      const s = d.samples, now = ts;
      const lastS = s[s.length - 1];
      let first = s.find(([, ts]) => now - ts < 100) ?? lastS;
      if (first === lastS && s.length > 1) first = s[s.length - 2];
      const v = now - lastS[1] > 150 ? 0 : (lastS[0] - first[0]) / Math.max(16, lastS[1] - first[1]); // px/ms, + = down; held still = no flick
      const projected = anim.current.y + v * 180;
      let to = ORDER.reduce((best, x) => (Math.abs(yFor(x) - projected) < Math.abs(yFor(best) - projected) ? x : best), detent.peek());
      // a clear flick always moves at least one step
      const i = ORDER.indexOf(detent.peek());
      if (to === detent.peek() && Math.abs(v) > 0.45) to = v > 0 ? ORDER[Math.min(2, i + 1)] : ORDER[Math.max(0, i - 1)];
      if (to === detent.peek()) settle(to, v);
      else { anim.current.flickV = v; detent.value = to; play("snap"); } // the effect above springs there, with this speed
    };

    // pointer (mouse, pen, and touch when the sheet isn't fully open: touch-action is off then)
    const onDown = (e: PointerEvent) => {
      if (isDesktop.value || e.button > 0) return;
      const onGrip = !!(e.target as HTMLElement).closest(".sheet__grip");
      if (!onGrip && detent.peek() === "full") return; // full: the content scrolls (touch handled below)
      begin(e.clientY, e.pointerId, onGrip, e.timeStamp, e.pointerType !== "mouse");
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      // a busy page gets several moves at once: each one counts for the speed
      const all = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const c of all.slice(0, -1)) move(c.clientY, c.timeStamp);
      if (move(e.clientY, e.timeStamp) && !el.hasPointerCapture(e.pointerId)) { try { el.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }
    };
    const onUp = (e: PointerEvent) => { if (drag && drag.id === e.pointerId) end(e.target, e.timeStamp); };
    const onCancel = (e: PointerEvent) => { if (drag && drag.id === e.pointerId) end(null, e.timeStamp); };

    // touch on the content of the open sheet: scrolling, until it is at the top and the finger goes down
    let tStart: { y: number; x: number; top: number; decided: boolean; pulling: boolean; ts: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (isDesktop.value || detent.peek() !== "full" || e.touches.length !== 1) { tStart = null; return; }
      if ((e.target as HTMLElement).closest(".sheet__grip, .hscroll, input, textarea")) { tStart = null; return; }
      tStart = { y: e.touches[0].clientY, x: e.touches[0].clientX, top: body.scrollTop, decided: false, pulling: false, ts: e.timeStamp };
    };
    const onTouchMove = (e: TouchEvent) => {
      const s = tStart;
      if (!s || e.touches.length !== 1) return;
      const y = e.touches[0].clientY, dy = y - s.y, dx = e.touches[0].clientX - s.x;
      if (!s.decided) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        s.decided = true;
        s.pulling = body.scrollTop <= 0 && dy > 0 && Math.abs(dy) > Math.abs(dx);
        if (s.pulling) begin(s.y, "touch", false, s.ts);
      }
      if (!s.pulling) return;
      e.preventDefault(); // the sheet moves, not the content
      move(y, e.timeStamp);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const s = tStart;
      tStart = null;
      if (s?.pulling) end(e.target, e.timeStamp);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    body.addEventListener("touchstart", onTouchStart, { passive: true });
    body.addEventListener("touchmove", onTouchMove, { passive: false });
    body.addEventListener("touchend", onTouchEnd);
    body.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      body.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // the click that ends a drag must not open what the finger happened to be on
  const onClickCapture = (e: MouseEvent) => {
    if (anim.current.justDragged) { e.stopPropagation(); e.preventDefault(); }
  };

  return (
    <section
      ref={ref}
      class={`sheet glass${current === "full" ? " is-full" : ""}`}
      aria-label={label}
      data-detent={current}
      inert={inert}
      onClickCapture={onClickCapture as unknown as (e: Event) => void}
    >
      <div class="sheet__grip" role="button" tabIndex={0} data-sfx="none" aria-label={current === "full" ? t("collapse") : t("expand")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            detent.value = current === "full" ? "peek" : current === "peek" ? "half" : "full";
            play("snap");
          }
        }}>
        <span />
      </div>
      <div class="sheet__body" ref={bodyRef}>{children}</div>
    </section>
  );
}
