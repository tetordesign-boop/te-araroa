import { useState } from "preact/hooks";
import { t, type Key } from "../i18n";
import { reactions, toggleReaction } from "../lib/data";
import type { ReactionKey } from "../types";

const ITEMS: { k: ReactionKey; e: string; label: Key }[] = [
  { k: "heart", e: "❤️", label: "reactHeart" },
  { k: "clap", e: "👏", label: "reactClap" },
  { k: "fire", e: "🔥", label: "reactFire" },
  { k: "wow", e: "😮", label: "reactWow" },
];

export function Reactions({ dayId }: { dayId: string }) {
  const rx = reactions.value[dayId] ?? {};
  const [popped, setPopped] = useState<ReactionKey | null>(null);
  return (
    <div class="reactions" role="group" aria-label="Réactions">
      {ITEMS.map(({ k, e, label }) => {
        const s = rx[k];
        const mine = !!s?.mine;
        return (
          <button type="button" class={`react${mine ? " is-mine" : ""}${popped === k ? " pop" : ""}`} aria-pressed={mine}
            aria-label={`${t(label)}${s?.total ? `, ${s.total}` : ""}`}
            onClick={() => { if (!mine) setPopped(k); window.setTimeout(() => setPopped(null), 500); toggleReaction(dayId, k); }}>
            <span class="e" aria-hidden="true">{e}</span>
            {s?.total ? <span class="num">{s.total}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
