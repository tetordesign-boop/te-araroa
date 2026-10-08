import { useEffect, useState } from "preact/hooks";
import { MOCK } from "../config";
import { lang, t } from "../i18n";
import { deviceId, messageCounts, sb } from "../lib/data";
import { relTime } from "../lib/format";
import type { Message } from "../types";

const NAME_KEY = "hut-name";

export function HutBook({ dayId }: { dayId: string | null }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch (_) { return ""; } });
  const [body, setBody] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const l = lang.value;

  useEffect(() => {
    let alive = true;
    setMsgs(null);
    (async () => {
      if (MOCK) { const { mockMessages } = await import("../dev/mock"); if (alive) setMsgs(mockMessages(dayId)); return; }
      let q = sb.from("messages").select("id,day_id,author,body,created_at").eq("hidden", false).order("created_at", { ascending: true }).limit(300);
      q = dayId ? q.eq("day_id", dayId) : q.is("day_id", null);
      const { data } = await q;
      if (alive) setMsgs((data ?? []) as Message[]);
    })();
    return () => { alive = false; };
  }, [dayId]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (trap) return; // bots fill every field
    const a = name.trim(), b = body.trim();
    if (!a || !b) return;
    setState({ kind: "sending" });
    try { localStorage.setItem(NAME_KEY, a); } catch (_) { /* ignore */ }
    if (MOCK) {
      setMsgs([...(msgs ?? []), { id: String(Date.now()), day_id: dayId, author: a, body: b, created_at: new Date().toISOString() }]);
      setBody(""); setState({ kind: "ok", msg: t("signed") });
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
    setBody("");
    setState({ kind: "ok", msg: t("signed") });
  };

  return (
    <section class="hut" aria-labelledby={`hut-${dayId ?? "all"}`}>
      <h2 class="section__title" id={`hut-${dayId ?? "all"}`}>{t("hutBook")}</h2>
      <p class="hut__intro">{t("hutBookIntro")}</p>
      {msgs === null ? null : msgs.length === 0 ? (
        <p class="hut__empty">{t("hutBookEmpty")}</p>
      ) : (
        <div>
          {msgs.map((m) => (
            <article class="hut__entry">
              <div class="hut__who"><span>{m.author}</span><time dateTime={m.created_at}>{relTime(m.created_at, l)}</time></div>
              <div class="hut__body">{m.body}</div>
            </article>
          ))}
        </div>
      )}
      <form class="form" onSubmit={submit}>
        <input class="field" type="text" name="name" autoComplete="given-name" maxLength={40} required
          placeholder={t("yourName")} aria-label={t("yourName")} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <textarea class="field" name="message" maxLength={800} required rows={3}
          placeholder={t("yourMessage")} aria-label={t("yourMessage")} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
        <button class="btn btn--primary btn--block" type="submit" disabled={state.kind === "sending" || !name.trim() || !body.trim()}>
          {state.kind === "sending" ? t("signing") : t("sign")}
        </button>
        <div class={`form__msg${state.kind === "error" ? " is-error" : ""}`} role="status" aria-live="polite">{state.msg ?? ""}</div>
      </form>
    </section>
  );
}
