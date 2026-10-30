// A segmented control with a liquid thumb: the raised selection slides to the option chosen with a spring, and
// squashes a little on the way, like the drop in the navigation (ui/LiquidNav.tsx). Same buttons as before
// (aria-pressed), the thumb is only a picture behind them.
import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

export type SegOption<T extends string> = { value: T; label: ComponentChildren; attrs?: JSX.HTMLAttributes<HTMLButtonElement> };

export function Seg<T extends string>({ options, value, onChange, label, class: cls = "" }: {
  options: SegOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  class?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const ready = useRef(false);
  const last = useRef<T | null>(null);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const i = options.findIndex((o) => o.value === value);
    const b = i >= 0 ? (el.querySelectorAll<HTMLButtonElement>(":scope > button")[i] ?? null) : null;
    setBox(b ? { x: b.offsetLeft, w: b.offsetWidth } : null);
  };

  useLayoutEffect(() => {
    measure();
    // the thumb stretches on its way, then settles (not on the first placing, nor with reduced motion)
    if (ready.current && last.current !== value && thumb.current?.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      thumb.current.animate([{ scale: "1 1" }, { scale: "1.04 0.86", offset: 0.35 }, { scale: "1 1" }], { duration: 460, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
    }
    last.current = value;
    const t = requestAnimationFrame(() => { ready.current = true; });
    return () => cancelAnimationFrame(t);
  }, [value, options.length]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} class={`seg seg--liquid ${cls}`} role="group" aria-label={label} data-ready={ready.current || undefined}>
      <span ref={thumb} class="seg__thumb" aria-hidden="true"
        style={box ? { transform: `translateX(${box.x}px)`, width: `${box.w}px`, opacity: 1 } : { opacity: 0 }} />
      {options.map((o) => (
        <button type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} {...o.attrs}>{o.label}</button>
      ))}
    </div>
  );
}
