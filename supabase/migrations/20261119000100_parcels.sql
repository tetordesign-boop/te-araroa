-- My food parcels: where each one waits for me along the trail, when it left, what is in it, and whether I have it.
-- Private: only the admins read or write them, in the Carnet; the site never shows them.
create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  place text not null check (length(place) between 1 and 200),
  km double precision check (km is null or km between 0 and 4000),
  status text not null default 'planned' check (status in ('planned', 'sent', 'collected')),
  sent_on date,
  contents text check (contents is null or length(contents) <= 2000),
  tracking text check (tracking is null or length(tracking) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parcels enable row level security;
create policy "only Ewan reads his parcels" on public.parcels
  for select to authenticated using ((select public.is_admin()));
create policy "only Ewan adds parcels" on public.parcels
  for insert to authenticated with check ((select public.is_admin()));
create policy "only Ewan changes his parcels" on public.parcels
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "only Ewan removes his parcels" on public.parcels
  for delete to authenticated using ((select public.is_admin()));
revoke all on public.parcels from anon;
grant select, insert, update, delete on public.parcels to authenticated;
create trigger parcels_touch before update on public.parcels
  for each row execute function private.touch_updated_at();
