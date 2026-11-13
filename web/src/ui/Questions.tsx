// "Vos questions": family and friends ask me anything from the site, without an account (ask_question, rate limited
// like the notes). A question stays private until I answer it in the Carnet and choose to show it; then it is here,
// with the first name it was signed with, and my answer in my own voice. The page loads its list when it opens.
import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK } from "../config";
import { lang, t } from "../i18n";
import { deviceId, sb } from "../lib/data";
import { fmtDate, typo } from "../lib/format";
import { play } from "../lib/sound";
import type { Question } from "../types";
import { Ask, ChevronRight } from "./icons";
import { PageHead } from "./Pages";
import { go, hrefFor } from "./state";

/** the answered questions, newest answer first (null until loaded; the table may not exist yet: then never shown) */
export const questions = signal<Question[] | null>(null);
export const questionsReady = signal<boolean | null>(MOCK ? true : null);
let loading: Promise<void> | null = null;

export function loadQuestions(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    if (MOCK) { questions.value = (await import("../dev/mock")).mockQuestions(); return; }
    const { data, error } = await sb.from("questions")
      .select("id,author,body,answer,answer_en,published,answered_at,created_at")
      .eq("published", true).not("answer", "is", null).order("answered_at", { ascending: false }).limit(200);
    if (error) {
      // (not set up yet on the server: the row stays hidden; a network error leaves it as it was)
      if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`)) questionsReady.value = false;
      loading = null;
      return;
    }
    questionsReady.value = true;
    questions.value = data as Question[];
  })().catch(() => { loading = null; });
  return loading;
}

const answerOf = (q: Question) => (lang.value === "en" && q.answer_en) || q.answer || "";

/** The way in, from the home panel and the "About" page (hidden while the questions aren't set up on the server). */
export function QuestionsRow({ block }: { block?: boolean }) {
  useEffect(() => { loadQuestions(); }, []);
  if (!questionsReady.value) return null;
  const n = questions.value?.length ?? 0;
  return (
    <div class={block ? "rows block" : "rows"}>
      <a class="row" href={hrefFor({ name: "questions" })} onClick={(e) => { e.preventDefault(); go({ name: "questions" }); }}>
        <span class="row__thumb row__thumb--empty" aria-hidden="true"><Ask /></span>
        <span class="row__main">
          <span class="row__title">{t("questions")}</span>
          <span class="row__meta">{questions.value === null ? " " : n === 0 ? t("questionsFirst") : n === 1 ? t("questionsOne") : t("questionsMany", { n })}</span>
        </span>
        <ChevronRight class="row__chev" />
      </a>
    </div>
  );
}

export function QuestionsPage() {
  const l = lang.value;
  useEffect(() => { loadQuestions(true); }, []);
  const list = questions.value;
  return (
    <div class="page qpage">
      <PageHead title={t("questions")} />
      <p class="qpage__intro">{t("questionsIntro")}</p>
      <AskForm />
      {list && list.length > 0 && (
        <section class="block" aria-labelledby="qa-head">
          <h2 class="h-section" id="qa-head">{t("questionsAnswered")}</h2>
          <ol class="qa">
            {list.map((q) => (
              <li class="qa__item" key={q.id}>
                <h3 class="qa__q">{typo(q.body)}</h3>
                <p class="qa__who">{q.author}{q.answered_at ? `, ${fmtDate(q.answered_at.slice(0, 10), l, { day: "numeric", month: "long" })}` : ""}</p>
                <div class="qa__a voice">{answerOf(q).split(/\n{2,}/).map((p) => <p>{typo(p)}</p>)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {list && list.length === 0 && <p class="empty block">{t("questionsNone")}</p>}
    </div>
  );
}

const NAME_KEY = "hut-name";

/** The form, the way the notes' one works: a button first, then the two fields, and the question echoed once sent. */
function AskForm() {
  const [writing, setWriting] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch (_) { return ""; } });
  const [body, setBody] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; msg?: string }>({ kind: "idle" });
  const [sent, setSent] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const askBtn = useRef<HTMLButtonElement>(null);
  const receipt = useRef<HTMLDivElement>(null);

  useEffect(() => { if (writing) (name.trim() ? bodyField.current : nameField.current)?.focus(); }, [writing]);
  useEffect(() => { if (sent) receipt.current?.focus({ preventScroll: true }); }, [sent]);

  const shake = (el: HTMLElement | null) => {
    if (!el?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: "none" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "none" }], { duration: 340, easing: "ease-in-out" });
  };
  const cancel = () => { setWriting(false); setState({ kind: "idle" }); requestAnimationFrame(() => askBtn.current?.focus({ preventScroll: true })); };
  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (trap) return;
    const a = name.trim(), b = body.trim();
    if (!a) { setState({ kind: "error", msg: t("questionNeedName") }); nameField.current?.focus(); shake(nameField.current); return; }
    if (!b) { setState({ kind: "error", msg: t("questionNeedBody") }); bodyField.current?.focus(); shake(bodyField.current); return; }
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try { localStorage.setItem(NAME_KEY, a); } catch (_) { /* ignore */ }
    if (!MOCK) {
      const { error } = await sb.rpc("ask_question", { p_author: a, p_body: b, p_device: deviceId });
      if (error) {
        const m = error.message || "";
        setState({ kind: "error", msg: m.includes("rate_limited") ? t("errRate") : m.includes("too_many_links") ? t("questionErrLinks") : t("questionErrSend") });
        return;
      }
    }
    play("signed");
    setSent(b);
    setBody(""); setWriting(false); setState({ kind: "idle" });
  };

  return (
    <div class="ask">
      {sent && !writing && (
        <div class="note__receipt" ref={receipt} tabIndex={-1}>
          <p class="note__done">
            <svg class="note__tick" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7 12.4l3.3 3.3L17.2 8.8" /></svg>
            {t("questionSent")}
          </p>
          <blockquote class="note__echo"><p>{typo(sent)}</p><footer>{name.trim()}</footer></blockquote>
        </div>
      )}
      {!writing ? (
        <button ref={askBtn} class="btn btn--tint btn--block note__write" type="button" onClick={() => { setSent(null); setState({ kind: "idle" }); setWriting(true); }}>
          <Ask />{sent ? t("questionAnother") : t("questionAsk")}
        </button>
      ) : (
        <form class="form" onSubmit={submit} noValidate>
          <label class="note__label" for="ask-name">{t("questionName")}</label>
          <input ref={nameField} id="ask-name" class="field" type="text" name="name" autoComplete="given-name" maxLength={40}
            value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <label class="note__label" for="ask-body">{t("questionBody")}</label>
          <textarea ref={bodyField} id="ask-body" class="field" name="question" maxLength={400} rows={3} placeholder={t("questionExample")}
            aria-describedby="ask-privacy" value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
          <p class="fine ask__privacy" id="ask-privacy">{t("questionPrivacy")}</p>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
          <div class="form__row">
            <button class="btn" type="button" data-sfx="close" onClick={cancel}>{t("cancel")}</button>
            <button class="btn btn--primary" type="submit" data-sfx="none" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? t("noteSending") : t("questionSend")}
            </button>
          </div>
        </form>
      )}
      <p class={state.kind === "error" ? "form__msg is-error" : "sr-only"} role="status" aria-live="polite" style={{ marginTop: "10px" }}>
        {state.kind === "error" ? state.msg : sent && !writing ? t("questionSent") : ""}
      </p>
    </div>
  );
}
