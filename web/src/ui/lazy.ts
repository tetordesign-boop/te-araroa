// A part of the page loaded only when it is first shown (the explorer's folders, the photo voyage), so the first
// visit downloads and parses less. Fetched in the background a few seconds after the page settles, so it is
// usually there before anyone asks for it.
import { h, type ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";

export function lazy<P extends object>(load: () => Promise<ComponentType<P>>) {
  let Comp: ComponentType<P> | null = null;
  let pending: Promise<unknown> | null = null;
  const get = () => (pending ??= load().then((c) => { Comp = c; }, (e) => { pending = null; throw e; }));
  function Lazy(props: P) {
    const [, setReady] = useState(0);
    useEffect(() => {
      if (Comp) return;
      let live = true;
      get().then(() => { if (live) setReady((n) => n + 1); }, () => { /* offline: shown next time */ });
      return () => { live = false; };
    }, []);
    return Comp ? h(Comp, props) : null;
  }
  Lazy.preload = () => { get().catch(() => {}); };
  return Lazy;
}

/** once the page has settled: idle time, or a few seconds */
export function whenIdle(fn: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  window.setTimeout(() => (ric ? ric(fn, { timeout: 4000 }) : fn()), 5000);
}
