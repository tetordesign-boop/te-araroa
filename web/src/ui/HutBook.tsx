import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK } from "../config";
import { lang, t } from "../i18n";
import { deviceId, messageCounts, sb } from "../lib/data";
import { relTime, typo } from "../lib/format";
import type { Message } from "../types";
import { Pencil } from "./icons";

const NAME_KEY = "hut-name";
const SHOWN = 4;

/** Like the paper book in every New Zealand hut: anyone can leave Ewan a few words. */
export function HutBook({ dayId }: { dayId: string | null }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [all, setAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch (_) { return ""; } });
  const [body, setBody] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const firstField = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLTextAreaElement>(null);
  const l = lang.value;

  useEffect(() => {
    let alive = true;
    setMsgs(null); setAll(false); setWriting(false); setState({ kind: "idle" });
    (async () => {
      if (MOCK) { const { mockMessages } = await import("../dev/mock"); if (alive) setMsgs(mockMessages(dayId).reverse()); return; }
      let q = sb.from("messages").select("id,day_id,author,body,created_at").eq("hidden", false).order("created_at", { ascending: true }).limit(300);
      q = dayId ? q.eq("day_id", dayId) : q.is("day_id", null);
      const { data } = await q;
      if (alive) setMsgs((data ?? []) as Message[]);
    })();
    return () => { alive = false; };
  }, [dayId]);

  useEffect(() => {
    if (!writing) return;
    (name.trim() ? message.current : firstField.current)?.focus({ preventScroll: false });
  }, [writing]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (trap) return; // bots fill every field
    const a = name.trim(), b = body.trim();
    if (!a || !b) return;
    setState({ kind: "sending" });
    try { localStorage.setItem(NAME_KEY, a); } catch (_) { /* ignore */ }
    if (MOCK) {
      setMsgs([...(msgs ?? []), { id: String(Date.now()), day_id: dayId, author: a, body: b, created_at: new Date().toISOString() }]);
      setBody(""); setWriting(false); setState({ kind: "ok", msg: t("signed") });
      return;
    }
    const { data, error } = await sb.rpc("post_message", { p_day: dayId, p_author: a, p_body: b, p_device: deviceId });
    if (error) {
      const m = error.message || "";
      setState({ kind: "error", msg: m.includes("rate_limited") ? t("errRate") : m.includes("too_many_links") ? t("errLinks") : t("errSend") });
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Message;
    setMsgs([...(msgs ?? []), row]);
    if (dayId) messageCounts.value = { ...messageCounts.value, [dayId]: (messageCounts.value[dayId] ?? 0) + 1 };
    setBody(""); setWriting(false);
    setState({ kind: "ok", msg: t("signed") });
  };

  // newest first: what people come back for is what was written since last time
  const list = msgs ? [...msgs].reverse() : [];
  const shown = all ? list : list.slice(0, SHOWN);
  const hidden = list.length - shown.length;

  return (
    <section class="hut" aria-labelledby={`hut-${dayId ?? "all"}`}>
      <h2 class="h-section" id={`hut-${dayId ?? "all"}`}>{t("hutBook")}</h2>
      <p class="hut__intro">{t("hutBookIntro")}</p>

      {msgs !== null && list.length === 0 && <p class="hut__empty">{t("hutBookEmpty")}</p>}
      {shown.length > 0 && (
        <ol class="hut__list">
          {shown.map((m) => (
            <li class="hut__entry">
              <div class="hut__who"><span>{m.author}</span><time dateTime={m.created_at}>{relTime(m.created_at, l)}</time></div>
              <p class="hut__body">{typo(m.body)}</p>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <button class="textbtn hut__more" type="button" onClick={() => setAll(true)}>
          {hidden === 1 ? t("moreNote") : t("moreNotes", { n: hidden })}
        </button>
      )}

      {!writing ? (
        <>
          <button class="btn btn--tint btn--block hut__write" type="button" onClick={() => { setWriting(true); setState({ kind: "idle" }); }}>
            <Pencil />{t("writeNote")}
          </button>
          {state.kind === "ok" && <p class="form__msg" role="status" style={{ marginTop: "10px" }}>{state.msg}</p>}
        </>
      ) : (
        <form class="form" onSubmit={submit}>
          <input ref={firstField} class="field" type="text" name="name" autoComplete="given-name" maxLength={40} required
            placeholder={t("yourName")} aria-label={t("yourName")} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <textarea ref={message} class="field" name="message" maxLength={800} required rows={4}
            placeholder={t("yourMessage")} aria-label={t("yourMessage")} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
          <div class="form__row">
            <button class="btn" type="button" onClick={() => { setWriting(false); setState({ kind: "idle" }); }}>{t("cancel")}</button>
            <button class="btn btn--primary" type="submit" disabled={state.kind === "sending" || !name.trim() || !body.trim()}>
              {state.kind === "sending" ? t("signing") : t("sign")}
            </button>
          </div>
          <div class={`form__msg${state.kind === "error" ? " is-error" : ""}`} role="status" aria-live="polite">{state.kind === "error" ? state.msg : ""}</div>
        </form>
      )}
    </section>
  );
}
