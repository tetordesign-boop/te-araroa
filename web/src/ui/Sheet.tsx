import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { detent, isDesktop, mapApi, type Detent } from "./state";

const PEEK = 230;

export function Sheet({ children, label }: { children: ComponentChildren; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sheetH, setSheetH] = useState(() => window.innerHeight - 90);
  const [vh, setVh] = useState(window.innerHeight);
  const drag = useRef<{ y0: number; t0: number; start: number; moved: boolean; id: number; onGrip: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { setSheetH(el.offsetHeight); setVh(window.innerHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const peek = Math.min(PEEK, sheetH * 0.5);
  const half = Math.max(peek + 80, Math.round(vh * 0.54));
  const visibleFor = (d: Detent) => (d === "peek" ? peek : d === "half" ? Math.min(half, sheetH) : sheetH);
  const yFor = (d: Detent) => sheetH - visibleFor(d);
  const current = detent.value;
  const y = offset ?? yFor(current);

  // tell the map how much of it is covered, so it frames things in the visible part
  useLayoutEffect(() => {
    const visible = visibleFor(current);
    const bottomInset = ref.current ? parseFloat(getComputedStyle(ref.current).bottom) || 8 : 8;
    document.documentElement.style.setProperty("--sheet-visible", `${isDesktop.value ? 0 : visible}px`);
    mapApi.value?.setPadding(isDesktop.value
      ? { left: 440, bottom: 40, top: 90, right: 70 }
      : { left: 24, right: 70, top: 84, bottom: Math.min(visible, vh * 0.6) + Math.max(8, bottomInset) + 12 });
  }, [current, sheetH, vh, isDesktop.value, mapApi.value]);

  useEffect(() => {
    if (current !== "full" && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [current]);

  const onDown = (e: PointerEvent) => {
    if (isDesktop.value || e.button > 0) return;
    const onGrip = !!(e.target as HTMLElement).closest(".sheet__grip");
    if (!onGrip && current === "full") return;
    drag.current = { y0: e.clientY, t0: e.timeStamp, start: y, moved: false, id: e.pointerId, onGrip };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      try { ref.current?.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    setOffset(Math.max(0, Math.min(sheetH - 110, d.start + dy)));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (d.onGrip) detent.value = current === "peek" ? "half" : current === "half" ? "full" : "half";
      else if (current === "peek" && !(e.target as HTMLElement).closest("a,button,input,textarea")) detent.value = "half";
      return;
    }
    window.setTimeout(() => setDragging(false), 0);
    const pos = Math.max(0, Math.min(sheetH - 110, d.start + (e.clientY - d.y0)));
    const v = (e.clientY - d.y0) / Math.max(1, e.timeStamp - d.t0); // px/ms, + = down
    const order: Detent[] = ["full", "half", "peek"];
    let target: Detent;
    if (Math.abs(v) > 0.5) {
      const i = order.indexOf(current);
      target = v > 0 ? order[Math.min(2, i + 1)] : order[Math.max(0, i - 1)];
    } else {
      target = order.reduce((best, dd) => (Math.abs(yFor(dd) - pos) < Math.abs(yFor(best) - pos) ? dd : best), current);
    }
    setOffset(null);
    detent.value = target;
  };

  // swallow the click that ends a drag
  const onClickCapture = (e: MouseEvent) => {
    if (dragging) { e.stopPropagation(); e.preventDefault(); }
  };

  return (
    <section
      ref={ref}
      class={`sheet glass${current === "full" ? " is-full" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ "--sheet-y": `${y}px` }}
      aria-label={label}
      data-detent={current}
      onPointerDown={onDown as unknown as (e: Event) => void}
      onPointerMove={onMove as unknown as (e: Event) => void}
      onPointerUp={onUp as unknown as (e: Event) => void}
      onPointerCancel={() => { drag.current = null; setDragging(false); setOffset(null); }}
      onClickCapture={onClickCapture as unknown as (e: Event) => void}
    >
      <div class="sheet__grip" role="button" tabIndex={0} aria-label={current === "full" ? t("collapse") : t("expand")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            detent.value = current === "full" ? "peek" : current === "peek" ? "half" : "full";
          }
        }}>
        <span />
      </div>
      <div class="sheet__body" ref={bodyRef}>{children}</div>
    </section>
  );
}
