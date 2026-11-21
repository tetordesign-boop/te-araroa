-- Buying a ticket of the trail outright, and gifts ("un coup de pouce"), paid on Stripe with nothing for me to approve.
-- A ticket bought is held for its buyer while they pay (start_purchase: rate limited like the requests, refused when
-- the spot is taken, or held by someone else who is on the payment page); the "checkout" function then opens a Stripe
-- payment at that request's price and, once Stripe itself says it's paid, gives the spot (service role). A ticket
-- asked for free stays a request I answer in the Carnet (request_sponsor), so nobody can fill the map for nothing.
-- Gifts are written by the function once paid (public.gifts: only I read them). The buyer's logo waits in a private
-- bucket ("pending") until the ticket is paid. The Stripe key, a restricted key that can only open and read payments,
-- is pasted in the Carnet (admin_set_stripe_key) and kept in private.secrets: never shown again, only its ends.

alter table public.sponsor_requests add column if not exists kind text not null default 'ask';
alter table public.sponsor_requests drop constraint if exists sponsor_requests_kind_check;
alter table public.sponsor_requests add constraint sponsor_requests_kind_check check (kind in ('ask', 'buy'));
alter table public.sponsor_requests drop constraint if exists sponsor_requests_status_check;
alter table public.sponsor_requests add constraint sponsor_requests_status_check
  check (status in ('new', 'done', 'pending', 'paid', 'expired', 'conflict'));
alter table public.sponsor_requests add column if not exists hold_until timestamptz;
alter table public.sponsor_requests add column if not exists logo_tmp text
  check (logo_tmp is null or logo_tmp ~ '^[0-9a-f-]{36}\.png$');
grant select (kind, hold_until) on public.sponsor_requests to authenticated;
create index if not exists sponsor_requests_waiting on public.sponsor_requests (spot_id) where status = 'pending';

create or replace function public.start_purchase(p_spot text, p_label text, p_name text, p_contact text, p_link text, p_message text,
  p_amount_cents integer, p_lang text, p_device uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := private.caller_ip_hash();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  -- only the trail's own tickets: a kilometre, a pass, a section, the start, the finish
  if coalesce(p_spot, '') !~ '^(km-[0-9]{1,4}|col-[a-z0-9-]{1,70}|section-[0-9]{2}|depart|arrivee)$' then raise exception 'bad_spot'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then raise exception 'bad_label'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'bad_name'; end if;
  if char_length(v_contact) < 1 or char_length(v_contact) > 120 then raise exception 'bad_contact'; end if;
  if v_msg is not null and char_length(v_msg) > 400 then raise exception 'bad_message'; end if;
  if v_link is not null and char_length(v_link) > 200 then raise exception 'bad_link'; end if;
  if p_amount_cents is null or p_amount_cents < 500 or p_amount_cents > 1000000 then raise exception 'bad_amount'; end if;
  if (select count(*) from regexp_matches(coalesce(v_msg, '') || ' ' || v_contact, 'https?://', 'g')) > 1 then raise exception 'too_many_links'; end if;
  if (select count(*) from public.sponsor_requests r
      where (r.ip_hash = v_hash or r.device_id = p_device) and r.created_at > now() - interval '10 minutes') >= 4 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.sponsor_requests r where r.ip_hash = v_hash and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  if exists (select 1 from public.sponsor_spots s where s.spot_id = p_spot) then raise exception 'spot_taken'; end if;
  -- someone else on the payment page for it (their own earlier try doesn't stop them)
  if exists (select 1 from public.sponsor_requests r where r.spot_id = p_spot and r.status = 'pending' and r.checkout_id is not null
             and r.hold_until > now() and r.device_id is distinct from p_device) then
    raise exception 'spot_held';
  end if;
  insert into public.sponsor_requests (spot_id, spot_label, name, contact, link, message, lang, kind, status, amount_cents, currency, hold_until, device_id, ip_hash)
  values (p_spot, v_label, v_name, v_contact, v_link, v_msg, case when p_lang = 'en' then 'en' else 'fr' end, 'buy', 'pending',
          p_amount_cents, 'eur', now() + interval '35 minutes', p_device, v_hash)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.start_purchase(text, text, text, text, text, text, integer, text, uuid) from public;
grant execute on function public.start_purchase(text, text, text, text, text, text, integer, text, uuid) to anon, authenticated;

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique check (session_id ~ '^cs_(live|test)_[A-Za-z0-9_]{6,200}$'),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (char_length(currency) = 3),
  name text check (name is null or char_length(name) <= 60),
  message text check (message is null or char_length(message) <= 400),
  email text check (email is null or char_length(email) <= 200),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  created_at timestamptz not null default now()
);
alter table public.gifts enable row level security;
drop policy if exists "Ewan reads the gifts" on public.gifts;
create policy "Ewan reads the gifts" on public.gifts for select to authenticated using ((select public.is_admin()));
drop policy if exists "Ewan deletes a gift" on public.gifts;
create policy "Ewan deletes a gift" on public.gifts for delete to authenticated using ((select public.is_admin()));
revoke all on public.gifts from anon, authenticated;
grant select, delete on public.gifts to authenticated;

-- the buyers' logos, until their ticket is paid: private, small, PNG only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pending', 'pending', false, 409600, array['image/png'])
on conflict (id) do nothing;

create or replace function public.admin_set_stripe_key(p_key text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text := btrim(coalesce(p_key, ''));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v = '' then delete from private.secrets where key = 'stripe_key'; return null; end if;
  if v !~ '^(rk|sk)_(live|test)_[A-Za-z0-9]{20,250}$' then raise exception 'bad_key'; end if;
  insert into private.secrets (key, value) values ('stripe_key', v)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return left(v, 8) || '…' || right(v, 4);
end $$;
create or replace function public.admin_stripe_key_hint() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select left(s.value, 8) || '…' || right(s.value, 4) from private.secrets s where s.key = 'stripe_key');
end $$;
revoke all on function public.admin_set_stripe_key(text) from public;
revoke all on function public.admin_stripe_key_hint() from public;
grant execute on function public.admin_set_stripe_key(text) to authenticated;
grant execute on function public.admin_stripe_key_hint() to authenticated;
