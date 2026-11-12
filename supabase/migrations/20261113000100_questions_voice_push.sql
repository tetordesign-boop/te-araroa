-- Three things for family and friends (Nov 2026): questions they ask me and I answer on the site, my voice note in a
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
  v_author text := btrim(regexp_replace(coalesce(p_author, ''), '\s+', ' ', 'g'));
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
  endpoint text primary key check (char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
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
