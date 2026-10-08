-- updated_at helper
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ============ SETTINGS (single row) ============
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  site_title text not null default 'Te Araroa',
  site_tagline_fr text not null default 'Île du Sud · de Ship Cove à Bluff',
  site_tagline_en text not null default 'South Island · Ship Cove to Bluff',
  hiker_name text,
  intro_fr text,
  intro_en text,
  start_date date,
  target_end_date date,
  direction text not null default 'sobo' check (direction in ('sobo','nobo')),
  position_delay_minutes int not null default 0 check (position_delay_minutes between 0 and 2880),
  linz_api_key text,
  trail_version text,
  trail_total_km double precision,
  trail_updated_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);
create trigger settings_touch before update on public.settings
  for each row execute function private.touch_updated_at();
alter table public.settings enable row level security;
create policy "settings are public" on public.settings
  for select to anon, authenticated using (true);
create policy "admins update settings" on public.settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ============ DAYS (one stage per date) ============
create table public.days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  day_number int not null check (day_number > 0),
  kind text not null default 'hike' check (kind in ('hike','rest','transport')),
  title text check (char_length(title) <= 140),
  title_en text check (char_length(title_en) <= 140),
  story text check (char_length(story) <= 20000),
  story_en text check (char_length(story_en) <= 20000),
  start_km double precision,
  end_km double precision,
  start_lng double precision, start_lat double precision,
  end_lng double precision, end_lat double precision,
  start_name text check (char_length(start_name) <= 80),
  end_name text check (char_length(end_name) <= 80),
  distance_km double precision check (distance_km is null or distance_km between 0 and 200),
  ascent_m int, descent_m int,
  moving_time_min int,
  weather text check (char_length(weather) <= 16),
  mood text check (char_length(mood) <= 16),
  cover_media_id uuid,
  track jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index days_date_idx on public.days (date);
create trigger days_touch before update on public.days
  for each row execute function private.touch_updated_at();
alter table public.days enable row level security;
create policy "published days are public" on public.days
  for select to anon, authenticated using (published or (select public.is_admin()));
create policy "admins insert days" on public.days
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update days" on public.days
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete days" on public.days
  for delete to authenticated using ((select public.is_admin()));

-- ============ MEDIA ============
create table public.media (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.days(id) on delete cascade,
  kind text not null check (kind in ('photo','video','embed')),
  path text,
  thumb_path text,
  embed_url text check (embed_url is null or embed_url ~* '^https://'),
  width int, height int,
  duration_s real,
  bytes bigint,
  taken_at timestamptz,
  lng double precision, lat double precision,
  caption text check (char_length(caption) <= 500),
  caption_en text check (char_length(caption_en) <= 500),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index media_day_idx on public.media (day_id, sort);
alter table public.days add constraint days_cover_fk
  foreign key (cover_media_id) references public.media(id) on delete set null;
create index days_cover_idx on public.days (cover_media_id);
alter table public.media enable row level security;
create policy "media of published days is public" on public.media
  for select to anon, authenticated using (
    (select public.is_admin())
    or exists (select 1 from public.days d where d.id = media.day_id and d.published)
  );
create policy "admins insert media" on public.media
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update media" on public.media
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete media" on public.media
  for delete to authenticated using ((select public.is_admin()));

-- ============ POSITIONS ============
create table public.positions (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null,
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  alt real,
  acc real,
  speed real,
  batt smallint,
  source text not null check (source in ('owntracks','checkin','photo','manual')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (source, recorded_at)
);
create index positions_time_idx on public.positions (recorded_at desc);
alter table public.positions enable row level security;
create policy "positions are public after the privacy delay" on public.positions
  for select to anon, authenticated using (
    (select public.is_admin())
    or recorded_at <= now() - make_interval(mins => (select s.position_delay_minutes from public.settings s where s.id = 1))
  );
create policy "admins insert positions" on public.positions
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update positions" on public.positions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete positions" on public.positions
  for delete to authenticated using ((select public.is_admin()));

-- ============ MESSAGES (words from family & friends) ============
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  day_id uuid references public.days(id) on delete cascade,
  author text not null check (char_length(btrim(author)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 800),
  device_id uuid,
  ip_hash text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_day_idx on public.messages (day_id, created_at);
alter table public.messages enable row level security;
create policy "visible messages are public" on public.messages
  for select to anon, authenticated using (not hidden or (select public.is_admin()));
create policy "admins update messages" on public.messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete messages" on public.messages
  for delete to authenticated using ((select public.is_admin()));
revoke select on public.messages from anon, authenticated;
grant select (id, day_id, author, body, hidden, created_at) on public.messages to anon, authenticated;
revoke insert, update, delete on public.messages from anon;

-- ============ REACTIONS ============
create table public.reactions (
  day_id uuid not null references public.days(id) on delete cascade,
  emoji text not null check (emoji in ('heart','clap','fire','wow')),
  device_id uuid not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  primary key (day_id, emoji, device_id)
);
create index reactions_ip_idx on public.reactions (ip_hash, created_at);
alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;
