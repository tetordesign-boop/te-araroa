-- Only kilometres are sponsored now (no more passes, sections, start or finish): the database refuses any other spot,
-- whether bought (start_purchase), asked for free (request_sponsor) or given from the Carnet.
-- (Every row there already is a kilometre.)
alter table public.sponsor_requests add constraint sponsor_requests_km_only check (spot_id ~ '^km-[0-9]{1,4}$');
alter table public.sponsor_spots add constraint sponsor_spots_km_only check (spot_id ~ '^km-[0-9]{1,4}$');
