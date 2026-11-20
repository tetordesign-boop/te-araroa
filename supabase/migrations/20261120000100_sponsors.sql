-- "Les tickets du sentier": sponsoring a piece of my Te Araroa (a kilometre, a pass, a section, a food parcel…).
-- sponsor_spots: the spots I've given to someone, public: the site shows the name on the ticket, and the logo turns in
-- 3D on the map at that spot, with the link to the sponsor's site or Instagram (the logo is a file in the media bucket).
-- sponsor_requests: what people ask for from the site without an account (request_sponsor: rate limited like the
-- questions), private: only I read them, in the Carnet. Who asked and how to reach them never leave it.
create table if not exists public.sponsor_spots (
  spot_id text primary key check (spot_id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  logo text check (logo is null or logo ~ '^sponsors/[A-Za-z0-9._-]{1,120}$'),
  link text check (link is null or (link ~ '^https://[^\s]+$' and char_length(link) <= 300)),
  created_at timestamptz not null default now()
);
alter table public.sponsor_spots enable row level security;
drop policy if exists "sponsored spots are public" on public.sponsor_spots;
create policy "sponsored spots are public" on public.sponsor_spots for select to anon, authenticated using (true);
drop policy if exists "Ewan gives spots" on public.sponsor_spots;
create policy "Ewan gives spots" on public.sponsor_spots for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Ewan renames spots" on public.sponsor_spots;
create policy "Ewan renames spots" on public.sponsor_spots for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Ewan frees spots" on public.sponsor_spots;
create policy "Ewan frees spots" on public.sponsor_spots for delete to authenticated using ((select public.is_admin()));
revoke all on public.sponsor_spots from anon, authenticated;
grant select on public.sponsor_spots to anon, authenticated;
grant insert, update, delete on public.sponsor_spots to authenticated;

create table if not exists public.sponsor_requests (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null check (spot_id ~ '^[a-z0-9-]{1,80}$'),
  spot_label text not null check (char_length(spot_label) between 1 and 120),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  contact text not null check (char_length(btrim(contact)) between 1 and 120),
  link text check (link is null or char_length(link) <= 200),
  offer text check (offer is null or char_length(offer) <= 60),
  message text check (message is null or char_length(message) <= 400),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  status text not null default 'new' check (status in ('new', 'done')),
  -- the payment, once we agree: the amount, the secure Stripe link sent to the sponsor, and when it was paid
  amount_cents integer check (amount_cents is null or amount_cents between 100 and 10000000),
  currency text check (currency is null or currency in ('nzd', 'eur')),
  pay_url text check (pay_url is null or (pay_url ~ '^https://(buy|checkout)\.stripe\.com/' and char_length(pay_url) <= 600)),
  checkout_id text check (checkout_id is null or char_length(checkout_id) <= 200),
  paid_at timestamptz,
  device_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.sponsor_requests enable row level security;
drop policy if exists "Ewan reads requests" on public.sponsor_requests;
create policy "Ewan reads requests" on public.sponsor_requests for select to authenticated using ((select public.is_admin()));
drop policy if exists "Ewan handles requests" on public.sponsor_requests;
create policy "Ewan handles requests" on public.sponsor_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Ewan deletes requests" on public.sponsor_requests;
create policy "Ewan deletes requests" on public.sponsor_requests for delete to authenticated using ((select public.is_admin()));
-- (the device and the hash of the address, kept for rate limiting, are never readable)
revoke all on public.sponsor_requests from anon, authenticated;
grant select (id, spot_id, spot_label, name, contact, link, offer, message, lang, status, amount_cents, currency, pay_url, checkout_id, paid_at, created_at) on public.sponsor_requests to authenticated;
grant update (status, amount_cents, currency, pay_url, paid_at) on public.sponsor_requests to authenticated;
grant delete on public.sponsor_requests to authenticated;
create index if not exists sponsor_requests_recent on public.sponsor_requests (created_at desc);

-- (the price is the one they choose: free text, "50 €", "200 NZD", "du matériel")
create or replace function public.request_sponsor(p_spot text, p_label text, p_name text, p_contact text, p_link text, p_offer text, p_message text, p_lang text, p_device uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := private.caller_ip_hash();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_offer text := nullif(btrim(regexp_replace(coalesce(p_offer, ''), '\s+', ' ', 'g')), '');
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if coalesce(p_spot, '') !~ '^[a-z0-9-]{1,80}$' then raise exception 'bad_spot'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then raise exception 'bad_label'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'bad_name'; end if;
  if char_length(v_contact) < 1 or char_length(v_contact) > 120 then raise exception 'bad_contact'; end if;
  if v_msg is not null and char_length(v_msg) > 400 then raise exception 'bad_message'; end if;
  if v_link is not null and char_length(v_link) > 200 then raise exception 'bad_link'; end if;
  if v_offer is not null and char_length(v_offer) > 60 then raise exception 'bad_offer'; end if;
  if (select count(*) from regexp_matches(coalesce(v_msg, '') || ' ' || v_contact || ' ' || coalesce(v_offer, ''), 'https?://', 'g')) > 1 then raise exception 'too_many_links'; end if;
  if (select count(*) from public.sponsor_requests r
      where (r.ip_hash = v_hash or r.device_id = p_device) and r.created_at > now() - interval '10 minutes') >= 4 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.sponsor_requests r where r.ip_hash = v_hash and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into public.sponsor_requests (spot_id, spot_label, name, contact, link, offer, message, lang, device_id, ip_hash)
  values (p_spot, v_label, v_name, v_contact, v_link, v_offer, v_msg, case when p_lang = 'en' then 'en' else 'fr' end, p_device, v_hash)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_sponsor(text, text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.request_sponsor(text, text, text, text, text, text, text, text, uuid) to anon, authenticated;


-- The Stripe payment link with a price chosen by the payer, made once in Stripe: the Carnet adds the request's
-- reference to it, so each payment says which ticket it was for. A payment link isn't a secret (it only takes money).
alter table public.settings add column if not exists sponsor_pay_link text
  check (sponsor_pay_link is null or sponsor_pay_link ~ '^https://(buy|donate)\.stripe\.com/[A-Za-z0-9_]+$');
