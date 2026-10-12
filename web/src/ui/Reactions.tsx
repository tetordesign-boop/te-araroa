import { useEffect, useRef, useState } from "preact/hooks";
import { t, type Key } from "../i18n";
import { reactions, toggleReaction } from "../lib/data";
import type { ReactionKey } from "../types";

const ITEMS: { k: ReactionKey; e: string; label: Key }[] = [
  { k: "heart", e: "❤️", label: "reactHeart" },
  { k: "clap", e: "👏", label: "reactClap" },
  { k: "fire", e: "🔥", label: "reactFire" },
  { k: "wow", e: "😮", label: "reactWow" },
];

/** Where the little copies of the emoji fly when one is sent: a fan upwards, each a bit different. */
const SPARKS = Array.from({ length: 7 }, (_, i) => {
  const angle = (-150 + i * 20) * (Math.PI / 180);
  const dist = 46 + [6, 16, 2, 20, 4, 14, 8][i];
  return { dx: `${(Math.cos(angle) * dist).toFixed(1)}px`, dy: `${(Math.sin(angle) * dist).toFixed(1)}px`, rot: `${[-24, 12, -8, 18, -14, 22, -4][i]}deg`, delay: `${[0, 40, 15, 0, 30, 10, 45][i]}ms` };
});

export function Reactions({ dayId }: { dayId: string }) {
  const rx = reactions.value[dayId] ?? {};
  const [popped, setPopped] = useState<{ k: ReactionKey; n: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div class="reactions" role="group" aria-label="Réactions">
      {ITEMS.map(({ k, e, label }) => {
        const s = rx[k];
        const mine = !!s?.mine;
        const isPop = popped?.k === k;
        return (
          <button type="button" class={`react${mine ? " is-mine" : ""}${isPop ? " pop" : ""}`} aria-pressed={mine}
            aria-label={`${t(label)}${s?.total ? `, ${s.total}` : ""}`}
            onClick={() => {
              if (!mine) {
                setPopped({ k, n: (popped?.n ?? 0) + 1 });
                clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setPopped(null), 1000);
              }
              toggleReaction(dayId, k);
            }}>
            <span class="e" aria-hidden="true">{e}</span>
            {s?.total ? <span class="num" key={`${k}-${s.total}`}>{s.total}</span> : null}
            {isPop && (
              <span class="react__burst" aria-hidden="true" key={popped!.n}>
                {SPARKS.map((p) => <span style={`--dx:${p.dx};--dy:${p.dy};--rot:${p.rot};animation-delay:${p.delay}`}>{e}</span>)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
