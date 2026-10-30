import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK } from "../config";
import { t } from "../i18n";
import { deviceId, sb } from "../lib/data";
import { typo } from "../lib/format";
import { play } from "../lib/sound";
import { Pencil } from "./icons";

const NAME_KEY = "hut-name";

/**
 * A note for Ewan: family and friends write to him from the site, and only he reads it, in the Carnet. Nothing is
 * listed here (the database doesn't let a visitor read the notes back): the section says so plainly, and after
 * sending, the sender sees their own words once, as a receipt. `dayId` ties the note to the day it was written from.
 */
export function NoteToEwan({ dayId }: { dayId: string | null }) {
  const [writing, setWriting] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch (_) { return ""; } });
  const [body, setBody] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; msg?: string }>({ kind: "idle" });
  /** what was just sent, shown back as a receipt (on this screen only) */
  const [sent, setSent] = useState<{ author: string; body: string } | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const writeBtn = useRef<HTMLButtonElement>(null);
  const receipt = useRef<HTMLDivElement>(null);
  const id = `note-${dayId ?? "home"}`;

  // a new day page starts fresh
  useEffect(() => { setWriting(false); setSent(null); setState({ kind: "idle" }); }, [dayId]);
  useEffect(() => {
    if (writing) (name.trim() ? bodyField.current : nameField.current)?.focus();
  }, [writing]);
  useEffect(() => { if (sent) receipt.current?.focus({ preventScroll: true }); }, [sent]);

  const open = () => { setSent(null); setState({ kind: "idle" }); setWriting(true); };
  const cancel = () => { setWriting(false); setState({ kind: "idle" }); requestAnimationFrame(() => writeBtn.current?.focus({ preventScroll: true })); };

  /** a missing field says so with a little shake, the way a wrong password does */
  const shake = (el: HTMLElement | null) => {
    if (!el?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: "none" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "none" }], { duration: 360, easing: "ease-in-out" });
  };

  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (trap) return; // bots fill every field
    const a = name.trim(), b = body.trim();
    // (said next to the button and the field gets the focus, rather than a send button that stays grey without a reason)
    if (!a) { setState({ kind: "error", msg: t("noteNeedName") }); nameField.current?.focus(); shake(nameField.current); return; }
    if (!b) { setState({ kind: "error", msg: t("noteNeedBody") }); bodyField.current?.focus(); shake(bodyField.current); return; }
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try { localStorage.setItem(NAME_KEY, a); } catch (_) { /* ignore */ }
    if (!MOCK) {
      const { error } = await sb.rpc("post_message", { p_day: dayId, p_author: a, p_body: b, p_device: deviceId });
      if (error) {
        const m = error.message || "";
        setState({ kind: "error", msg: m.includes("rate_limited") ? t("errRate") : m.includes("too_many_links") ? t("errLinks") : t("errSend") });
        return;
      }
    }
    play("signed");
    setSent({ author: a, body: b });
    setBody(""); setWriting(false); setState({ kind: "idle" });
  };

  return (
    <section class="note" aria-labelledby={id}>
      <h2 class="h-section" id={id}>{t("noteTitle")}</h2>
      <p class="note__intro">{t("noteIntro")}</p>

      {sent && !writing && (
        <div class="note__receipt" ref={receipt} tabIndex={-1}>
          <p class="note__done">
            {/* the tick draws itself as the note leaves */}
            <svg class="note__tick" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7 12.4l3.3 3.3L17.2 8.8" /></svg>
            {t("noteSent")}
          </p>
          <blockquote class="note__echo">
            <p>{typo(sent.body)}</p>
            <footer>{sent.author}</footer>
          </blockquote>
        </div>
      )}

      {!writing ? (
        <button ref={writeBtn} class="btn btn--tint btn--block note__write" type="button" onClick={open}>
          <Pencil />{sent ? t("noteAnother") : t("noteWrite")}
        </button>
      ) : (
        <form class="form" onSubmit={submit} noValidate>
          <label class="note__label" for={`${id}-name`}>{t("noteName")}</label>
          <input ref={nameField} id={`${id}-name`} class="field" type="text" name="name" autoComplete="given-name" maxLength={40}
            value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <label class="note__label" for={`${id}-body`}>{t("noteBody")}</label>
          <textarea ref={bodyField} id={`${id}-body`} class="field" name="message" maxLength={800} rows={4} placeholder={t("noteExample")}
            value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
          <div class="form__row">
            <button class="btn" type="button" data-sfx="close" onClick={cancel}>{t("cancel")}</button>
            <button class="btn btn--primary" type="submit" data-sfx="none" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? t("noteSending") : t("noteSend")}
            </button>
          </div>
        </form>
      )}
      {/* one live region that stays on the page, so "sent" and errors are always announced (the receipt above already
          shows "sent", so that one is for screen readers only) */}
      <p class={state.kind === "error" ? "form__msg is-error" : "sr-only"} role="status" aria-live="polite" style={{ marginTop: "10px" }}>
        {state.kind === "error" ? state.msg : sent && !writing ? t("noteSent") : ""}
      </p>
    </section>
  );
}
