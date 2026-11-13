const e=`-- Three things for family and friends (Nov 2026): questions they ask me and I answer on the site, my voice note in a
-- day, and a notification on their phone when a day is published. Safe to run again.

-- ============ Questions ============
-- Asked from the site without an account (ask_question: rate limited like the notes); private until I answer one
-- and choose to show it, then public with the first name it was signed with.
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author text not null check (char_length(btrim(author)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  answer text check (answer is null or char_length(answer) <= 4000),
  answer_en text check (answer_en is null or char_length(answer_en) <= 4000),
  published boolean not null default false,
  answered_at timestamptz,
  device_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.questions enable row level security;
drop policy if exists "answered questions are public" on public.questions;
create policy "answered questions are public" on public.questions
  for select to anon, authenticated using (published and answer is not null);
drop policy if exists "Ewan reads every question" on public.questions;
create policy "Ewan reads every question" on public.questions
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "Ewan answers questions" on public.questions;
create policy "Ewan answers questions" on public.questions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Ewan deletes questions" on public.questions;
create policy "Ewan deletes questions" on public.questions
  for delete to authenticated using ((select public.is_admin()));
-- (the device and the hash of the address, kept for rate limiting, are never readable)
revoke all on public.questions from anon, authenticated;
grant select (id, author, body, answer, answer_en, published, answered_at, created_at) on public.questions to anon, authenticated;
grant update (answer, answer_en, published, answered_at) on public.questions to authenticated;
grant delete on public.questions to authenticated;

create or replace function public.ask_question(p_author text, p_body text, p_device uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := private.caller_ip_hash();
  v_author text := btrim(regexp_replace(coalesce(p_author, ''), '\\s+', ' ', 'g'));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if char_length(v_author) < 1 or char_length(v_author) > 40 then raise exception 'bad_author'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 400 then raise exception 'bad_body'; end if;
  if (select count(*) from regexp_matches(v_body, 'https?://', 'g')) > 1 then raise exception 'too_many_links'; end if;
  if (select count(*) from public.questions q
      where (q.ip_hash = v_hash or q.device_id = p_device) and q.created_at > now() - interval '10 minutes') >= 4 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.questions q where q.ip_hash = v_hash and q.created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into public.questions (author, body, device_id, ip_hash) values (v_author, v_body, p_device, v_hash)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.ask_question(text, text, uuid) from public;
grant execute on function public.ask_question(text, text, uuid) to anon, authenticated;

-- ============ Voice notes ============
-- One per day, recorded in the Carnet: where the sound is in the media bucket, how long it lasts, and the shape of
-- the waveform the site draws without downloading the sound: {"path": "d/<day>/voice-….m4a", "s": 42.1, "peaks": [..]}
alter table public.days add column if not exists voice jsonb;
alter table public.days drop constraint if exists days_voice_check;
alter table public.days add constraint days_voice_check
  check (voice is null or (jsonb_typeof(voice) = 'object' and char_length(voice::text) <= 4000));
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types
       || array['audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/mpeg', 'audio/webm', 'audio/ogg']) as m)
 where id = 'media';

-- ============ Notifications ============
-- Phones that asked to be told when a day is published (Web Push). Only the "push" server function reads them; a
-- visitor can add or remove their own phone, never list them. The endpoints are the browsers' own push services.
create table if not exists public.push_subs (
  endpoint text primary key check (char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com|[a-z0-9.-]+\\.notify\\.windows\\.com)/'),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  device_id uuid,
  ip_hash text,
  fails int not null default 0,
  hello_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;

-- the days already announced (never twice)
create table if not exists public.push_sent (
  day_id uuid primary key references public.days(id) on delete cascade,
  sent_at timestamptz not null default now(),
  phones int not null default 0
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text, p_device uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := private.caller_ip_hash();
begin
  if (select count(*) from public.push_subs s where s.ip_hash = v_hash and s.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.push_subs (endpoint, p256dh, auth, lang, device_id, ip_hash)
  values (p_endpoint, p_p256dh, p_auth, case when p_lang = 'en' then 'en' else 'fr' end, p_device, v_hash)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, device_id = excluded.device_id, fails = 0;
end $$;
revoke all on function public.push_subscribe(text, text, text, text, uuid) from public;
grant execute on function public.push_subscribe(text, text, text, text, uuid) to anon, authenticated;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.push_subs where endpoint = p_endpoint;
$$;
revoke all on function public.push_unsubscribe(text) from public;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;

-- for the Carnet: how many phones would be told, and the last announcement
create or replace function public.push_stats()
returns table (phones int, last_sent timestamptz, last_phones int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query select (select count(*)::int from public.push_subs),
    (select max(p.sent_at) from public.push_sent p),
    (select p.phones from public.push_sent p order by p.sent_at desc limit 1);
end $$;
revoke all on function public.push_stats() from public;
grant execute on function public.push_stats() to authenticated;

-- the server's pair of keys for Web Push, made once by the push function itself (the private half never leaves the
-- database): keeps the first value stored, and returns what is stored
create or replace function public.svc_init_secret(p_key text, p_value text)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into private.secrets (key, value) values (p_key, p_value) on conflict (key) do nothing;
  return (select s.value from private.secrets s where s.key = p_key);
end $$;
revoke all on function public.svc_init_secret(text, text) from public, anon, authenticated;
grant execute on function public.svc_init_secret(text, text) to service_role;
`,n=`// The "push" server function in one file, for the Supabase dashboard (Edge Functions, Deploy a new function, Via Editor).
// Made from supabase/functions/push/index.ts and supabase/functions/_shared/ (util.ts, webpush.ts).

// Shared helpers for the Te Araroa edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      return parsed.default ?? Object.values(parsed)[0];
    } catch (_) { /* ignore */ }
  }
  throw new Error("No service key available");
}

let _admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await adminClient().rpc("svc_get_secret", { p_key: key });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** True when the request carries the bearer token of a site admin. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\\s+/i, "");
  if (!token || token.split(".").length !== 3) return false;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: row } = await admin.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!row;
}

// Web Push without a library: the message encrypted for the phone it goes to (RFC 8291, "aes128gcm") and signed by
// this server (VAPID, RFC 8292), with nothing but the platform's WebCrypto, so the same code runs in the server
// function (Deno) and in the tests (Node: scripts/push/webpush.test.mjs checks it against the RFC's own example).

const enc = new TextEncoder();

export const b64u = {
  encode(b: Uint8Array): string {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "===".slice((t.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** HKDF-SHA-256: extract with the salt, expand with the info, \`length\` bytes */
export async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The server's identity for the push services: the public half goes to the browsers, the private half signs. */
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64u.encode(raw), privateJwk: jwk };
}

/** "vapid t=<signed token>, k=<public key>": who sends, for which push service, valid 12 hours */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string): Promise<string> {
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const { key_ops: _ops, ext: _ext, ...jwk } = keys.privateJwk;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // (WebCrypto signs as r‖s, 64 bytes: the form a JSON web token wants)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(\`\${head}.\${claims}\`)));
  return \`vapid t=\${head}.\${claims}.\${b64u.encode(sig)}, k=\${keys.publicKey}\`;
}

/**
 * The message, readable only by the browser that subscribed (its public key \`p256dh\` and secret \`auth\`): a one-off
 * key pair on this side, the shared secret, then AES-128-GCM in a single record. \`fixed\` is for the tests (the
 * RFC's example uses a known key pair and salt).
 */
export async function encrypt(
  payload: Uint8Array,
  sub: { p256dh: string; auth: string },
  fixed?: { keys: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = b64u.decode(sub.p256dh);
  const authSecret = b64u.decode(sub.auth);
  const asKeys = fixed?.keys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\\0"), uaPublic, asPublic), 32);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // the last (and only) record ends with the delimiter 2
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string }

/** Sends one notification; \`gone\` when the phone has unsubscribed (the row can go). */
export async function sendPush(
  sub: PushSubscriptionRow,
  message: unknown,
  keys: VapidKeys,
  opts: { subject: string; ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string },
): Promise<{ status: number; gone: boolean }> {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub);
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl ?? 2 * 86400),
    Urgency: opts.urgency ?? "normal",
    Authorization: await vapidAuth(sub.endpoint, keys, opts.subject),
  };
  // (a phone that was off gets only the latest of the messages with the same topic)
  if (opts.topic) headers.Topic = opts.topic;
  const res = await fetch(sub.endpoint, { method: "POST", headers, body });
  await res.body?.cancel();
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}

// push — tells family and friends' phones that I've published a day (Web Push), and gives the site the key it needs.
//   GET  ?key                                  → { key }: the server's public key (made once, kept in the database)
//   POST { action: "hello", endpoint }         → a first notification to a phone that has just signed up (once an hour)
//   POST { action: "notify", days: [id, …] }   → from the Carnet, signed in: one notification for the days just
//                                                published (each day announced once, only if recent, and only from
//                                                the start date on)
// The phones' addresses are only ever read here (public.push_subs: no access from the site).

const SITE = "https://tetordesign-boop.github.io/te-araroa/";
const ICON = \`\${SITE}icons/icon-192.png\`;
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
  const url = \`\${SITE}#/jour/\${last.day_number}\`;
  if (list.length > 1) {
    const ns = list.map((d) => d.day_number);
    const run = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
    return {
      title: run ? (l === "fr" ? \`Jours \${ns[0]} à \${last.day_number}\` : \`Days \${ns[0]} to \${last.day_number}\`)
        : (l === "fr" ? \`\${list.length} nouvelles étapes\` : \`\${list.length} new days\`),
      body: l === "fr" ? \`\${list.length} nouvelles étapes dans mon journal.\` : \`\${list.length} new days in my journal.\`,
      url, tag: \`day-\${last.day_number}\`,
    };
  }
  const d = last;
  const place = d.kind === "rest" ? (d.end_name ?? d.start_name) : d.end_name;
  const title = l === "fr" ? \`Jour \${d.day_number}\${place ? \`\${NN}: \${place}\` : ""}\` : \`Day \${d.day_number}\${place ? \`: \${place}\` : ""}\`;
  const own = (l === "en" && d.title_en) || d.title;
  let body = own
    ? own
    : d.kind === "rest" ? (l === "fr" ? "Jour de repos." : "Rest day.")
    : d.kind === "transport" ? (l === "fr" ? "Jour de transfert." : "Transfer day.")
    : d.distance_km
      ? (l === "fr"
        ? \`\${num(d.distance_km, l, 1)}\${NN}km\${d.ascent_m ? \` et \${num(d.ascent_m, l)}\${NN}m de montée\` : ""}.\`
        : \`\${num(d.distance_km, l, 1)} km\${d.ascent_m ? \` and \${num(d.ascent_m, l)} m of climbing\` : ""}.\`)
      : (l === "fr" ? "Une nouvelle étape dans mon journal." : "A new day in my journal.");
  if (d.voice) body += \`\${/[.!?…]$/.test(body) ? "" : "."} \${l === "fr" ? "Avec un message vocal." : "With a voice note."}\`;
  return { title, body, url, tag: \`day-\${d.day_number}\` };
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
`;export{e as FEATURES_SQL,n as PUSH_FUNCTION};
