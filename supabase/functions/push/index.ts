// push — tells family and friends' phones that I've published a day (Web Push), and gives the site the key it needs.
//   GET  ?key                                  → { key }: the server's public key (made once, kept in the database)
//   POST { action: "hello", endpoint }         → a first notification to a phone that has just signed up (once an hour)
//   POST { action: "notify", days: [id, …] }   → from the Carnet, signed in: one notification for the days just
//                                                published (each day announced once, only if recent, and only from
//                                                the start date on)
// The phones' addresses are only ever read here (public.push_subs: no access from the site).
import { adminClient, cors, isAdminRequest, json } from "../_shared/util.ts";
import { generateVapidKeys, sendPush, type PushSubscriptionRow, type VapidKeys } from "../_shared/webpush.ts";

const SITE = "https://tetordesign-boop.github.io/te-araroa/";
const ICON = `${SITE}icons/icon-192.png`;
/** older than this, a day being published (a correction, a day kept back) is not news */
const RECENT_DAYS = 4;

let vapid: VapidKeys | null = null;
async function keys(): Promise<VapidKeys> {
  if (vapid) return vapid;
  const db = adminClient();
  const { data: stored, error } = await db.rpc("svc_get_secret", { p_key: "vapid" });
  if (error) throw error;
  if (stored) return (vapid = JSON.parse(stored as string));
  // the first time: a pair made here, kept unless another call stored one first
  const { data, error: e2 } = await db.rpc("svc_init_secret", { p_key: "vapid", p_value: JSON.stringify(await generateVapidKeys()) });
  if (e2) throw e2;
  return (vapid = JSON.parse(data as string));
}

type Lang = "fr" | "en";
interface Sub extends PushSubscriptionRow { lang: Lang; fails: number }
interface DayRow {
  id: string; day_number: number; date: string; kind: "hike" | "rest" | "transport";
  title: string | null; title_en: string | null; start_name: string | null; end_name: string | null;
  distance_km: number | null; ascent_m: number | null; voice: unknown | null;
}

const NN = " ";
const num = (n: number, l: Lang, digits = 0) =>
  new Intl.NumberFormat(l === "fr" ? "fr-FR" : "en-NZ", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

/** what the phone shows: in each visitor's language, in my words when the day has a title */
function message(list: DayRow[], l: Lang) {
  const last = list[list.length - 1];
  const url = `${SITE}#/jour/${last.day_number}`;
  if (list.length > 1) {
    const ns = list.map((d) => d.day_number);
    const run = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
    return {
      title: run ? (l === "fr" ? `Jours ${ns[0]} à ${last.day_number}` : `Days ${ns[0]} to ${last.day_number}`)
        : (l === "fr" ? `${list.length} nouvelles étapes` : `${list.length} new days`),
      body: l === "fr" ? `${list.length} nouvelles étapes dans mon journal.` : `${list.length} new days in my journal.`,
      url, tag: `day-${last.day_number}`,
    };
  }
  const d = last;
  const place = d.kind === "rest" ? (d.end_name ?? d.start_name) : d.end_name;
  const title = l === "fr" ? `Jour ${d.day_number}${place ? `${NN}: ${place}` : ""}` : `Day ${d.day_number}${place ? `: ${place}` : ""}`;
  const own = (l === "en" && d.title_en) || d.title;
  let body = own
    ? own
    : d.kind === "rest" ? (l === "fr" ? "Jour de repos." : "Rest day.")
    : d.kind === "transport" ? (l === "fr" ? "Jour de transfert." : "Transfer day.")
    : d.distance_km
      ? (l === "fr"
        ? `${num(d.distance_km, l, 1)}${NN}km${d.ascent_m ? ` et ${num(d.ascent_m, l)}${NN}m de montée` : ""}.`
        : `${num(d.distance_km, l, 1)} km${d.ascent_m ? ` and ${num(d.ascent_m, l)} m of climbing` : ""}.`)
      : (l === "fr" ? "Une nouvelle étape dans mon journal." : "A new day in my journal.");
  if (d.voice) body += `${/[.!?…]$/.test(body) ? "" : "."} ${l === "fr" ? "Avec un message vocal." : "With a voice note."}`;
  return { title, body, url, tag: `day-${d.day_number}` };
}

async function allSubs(): Promise<Sub[]> {
  const db = adminClient();
  const out: Sub[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("push_subs").select("endpoint,p256dh,auth,lang,fails").range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Sub[]));
    if (!data || data.length < 1000) return out;
  }
}

/** sends to every phone, a few at a time; forgets the ones that unsubscribed or keep failing */
async function broadcast(build: (l: Lang) => unknown, topic: string) {
  const db = adminClient(), k = await keys(), subs = await allSubs();
  let ok = 0;
  const gone: string[] = [], failed: Sub[] = [];
  const queue = [...subs];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const r = await sendPush(s, { ...(build(s.lang) as object), icon: ICON }, k, { subject: SITE, topic, ttl: 3 * 86400 });
        if (r.status >= 200 && r.status < 300) ok++;
        else if (r.gone) gone.push(s.endpoint);
        else failed.push(s);
      } catch (_) { failed.push(s); }
    }
  }));
  if (gone.length) await db.from("push_subs").delete().in("endpoint", gone);
  for (const s of failed) {
    if (s.fails >= 4) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
    else await db.from("push_subs").update({ fails: s.fails + 1 }).eq("endpoint", s.endpoint);
  }
  return { phones: subs.length, ok, gone: gone.length, failed: failed.length };
}

async function notify(ids: string[]) {
  const db = adminClient();
  // nothing before Ship Cove: no start date yet, or a day dated before it (a try-out in the Carnet), is never announced
  const { data: st } = await db.from("settings").select("start_date").eq("id", 1).maybeSingle();
  const start = (st as { start_date: string | null } | null)?.start_date;
  if (!start) return { days: 0, phones: 0, ok: 0, note: "no start date" };
  const recent = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString().slice(0, 10);
  const since = recent > start ? recent : start;
  const { data: rows, error } = await db.from("days")
    .select("id,day_number,date,kind,title,title_en,start_name,end_name,distance_km,ascent_m,voice")
    .in("id", ids).eq("published", true).gte("date", since).order("date");
  if (error) throw error;
  const { data: sent } = await db.from("push_sent").select("day_id").in("day_id", ids);
  const done = new Set((sent ?? []).map((r: { day_id: string }) => r.day_id));
  const list = (rows as DayRow[]).filter((d) => !done.has(d.id));
  if (!list.length) return { days: 0, phones: 0, ok: 0 };
  // marked first, so a second call (a retry from the phone) can't announce the same days twice
  const { error: e2 } = await db.from("push_sent").insert(list.map((d) => ({ day_id: d.id })));
  if (e2) return { days: 0, phones: 0, ok: 0, note: "already announced" };
  const res = await broadcast((l) => message(list, l), "nouvelle-etape");
  await db.from("push_sent").update({ phones: res.ok }).in("day_id", list.map((d) => d.id));
  return { days: list.length, ...res };
}

async function hello(endpoint: string) {
  const db = adminClient();
  const { data: s } = await db.from("push_subs").select("endpoint,p256dh,auth,lang,fails,hello_at").eq("endpoint", endpoint).maybeSingle();
  if (!s) return json({ error: "unknown" }, 404, cors);
  if (s.hello_at && Date.now() - Date.parse(s.hello_at) < 3600_000) return json({ ok: true, skipped: true }, 200, cors);
  await db.from("push_subs").update({ hello_at: new Date().toISOString() }).eq("endpoint", endpoint);
  const l: Lang = s.lang === "en" ? "en" : "fr";
  const r = await sendPush(s as Sub, {
    title: l === "fr" ? "Te Araroa avec moi" : "Te Araroa with me",
    body: l === "fr" ? "C'est réglé : vous serez prévenu à chaque nouvelle étape." : "All set: you'll hear from me each time I post a new day.",
    url: SITE, tag: "hello", icon: ICON,
  }, await keys(), { subject: SITE, ttl: 3600 });
  if (r.gone) await db.from("push_subs").delete().eq("endpoint", endpoint);
  return json({ ok: r.status >= 200 && r.status < 300, status: r.status }, 200, cors);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") return json({ key: (await keys()).publicKey }, 200, { ...cors, "Cache-Control": "public, max-age=3600" });
    if (req.method !== "POST") return json({ error: "method" }, 405, cors);
    const body = await req.json().catch(() => ({})) as { action?: string; endpoint?: unknown; days?: unknown };
    if (body.action === "hello" && typeof body.endpoint === "string" && body.endpoint.length < 1000) return await hello(body.endpoint);
    if (body.action === "notify") {
      if (!(await isAdminRequest(req))) return json({ error: "unauthorized" }, 401, cors);
      const ids = Array.isArray(body.days) ? body.days.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 30) : [];
      if (!ids.length) return json({ error: "no days" }, 400, cors);
      return json(await notify(ids), 200, cors);
    }
    return json({ error: "unknown action" }, 400, cors);
  } catch (e) {
    console.error("push", (e as Error)?.message ?? e);
    return json({ error: "server" }, 500, cors);
  }
});
