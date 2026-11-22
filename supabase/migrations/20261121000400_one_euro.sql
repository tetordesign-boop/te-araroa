-- A ticket from 1 € (it was 5 €): I'd rather not ask too much. The buyer can still change the amount on Stripe's
-- page (1 € a unit, the quantity adjustable: supabase/functions/checkout), and what was really paid is what's kept.
-- Same function as in 20261121000200_sponsor_checkout.sql, only the lowest amount changes (grants are kept).
CREATE OR REPLACE FUNCTION public.start_purchase(p_spot text, p_label text, p_name text, p_contact text, p_link text, p_message text, p_amount_cents integer, p_lang text, p_device uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text := private.caller_ip_hash();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if coalesce(p_spot, '') !~ '^(km-[0-9]{1,4}|col-[a-z0-9-]{1,70}|section-[0-9]{2}|depart|arrivee)$' then raise exception 'bad_spot'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then raise exception 'bad_label'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'bad_name'; end if;
  if char_length(v_contact) < 1 or char_length(v_contact) > 120 then raise exception 'bad_contact'; end if;
  if v_msg is not null and char_length(v_msg) > 400 then raise exception 'bad_message'; end if;
  if v_link is not null and char_length(v_link) > 200 then raise exception 'bad_link'; end if;
  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 1000000 then raise exception 'bad_amount'; end if;
  if (select count(*) from regexp_matches(coalesce(v_msg, '') || ' ' || v_contact, 'https?://', 'g')) > 1 then raise exception 'too_many_links'; end if;
  if (select count(*) from public.sponsor_requests r
      where (r.ip_hash = v_hash or r.device_id = p_device) and r.created_at > now() - interval '10 minutes') >= 4 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.sponsor_requests r where r.ip_hash = v_hash and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  if exists (select 1 from public.sponsor_spots s where s.spot_id = p_spot) then raise exception 'spot_taken'; end if;
  if exists (select 1 from public.sponsor_requests r where r.spot_id = p_spot and r.status = 'pending' and r.checkout_id is not null
             and r.hold_until > now() and r.device_id is distinct from p_device) then
    raise exception 'spot_held';
  end if;
  insert into public.sponsor_requests (spot_id, spot_label, name, contact, link, message, lang, kind, status, amount_cents, currency, hold_until, device_id, ip_hash)
  values (p_spot, v_label, v_name, v_contact, v_link, v_msg, case when p_lang = 'en' then 'en' else 'fr' end, 'buy', 'pending',
          p_amount_cents, 'eur', now() + interval '35 minutes', p_device, v_hash)
  returning id into v_id;
  return v_id;
end $function$;
