create table private.trail_tracks (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  file text not null,
  trk int not null,
  seg int not null,
  name text, descr text, kind text,
  geom extensions.geometry not null,
  created_at timestamptz not null default now()
);
create index trail_tracks_run_idx on private.trail_tracks (run_id);
create index trail_tracks_gix on private.trail_tracks using gist (geom);

create table private.trail_points (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  file text not null,
  name text, descr text, sym text, kind text,
  geom extensions.geometry not null,
  created_at timestamptz not null default now()
);
create index trail_points_run_idx on private.trail_points (run_id);
create index trail_points_gix on private.trail_points using gist (geom);

create or replace function public.svc_trail_ingest(p_run uuid, p_file text, p_tracks jsonb, p_points jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into private.trail_tracks (run_id, file, trk, seg, name, descr, kind, geom)
  select p_run, p_file, (t->>'trk')::int, (t->>'seg')::int, t->>'name', t->>'desc', t->>'type',
         extensions.st_setsrid(
           extensions.st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', t->'c')::text), 4326)
  from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb)) t
  where jsonb_array_length(t->'c') >= 2;

  insert into private.trail_points (run_id, file, name, descr, sym, kind, geom)
  select p_run, p_file, p->>'name', p->>'desc', p->>'sym', p->>'type',
         extensions.st_setsrid(extensions.st_makepoint((p->>'lon')::float8, (p->>'lat')::float8,
                                                       coalesce((p->>'ele')::float8, 0)), 4326)
  from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) p;

  return jsonb_build_object(
    'tracks', (select count(*) from private.trail_tracks where run_id = p_run),
    'points', (select count(*) from private.trail_points where run_id = p_run));
end $$;
revoke all on function public.svc_trail_ingest(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.svc_trail_ingest(uuid, text, jsonb, jsonb) to service_role;

-- Official km markers (numbered from Bluff = 0), used to orient tracks
create table private.trail_km as
  select name::int as km, geom from private.trail_points where false;
create index trail_km_gix on private.trail_km using gist(geom);
-- filled after an ingest with:
-- insert into private.trail_km select name::int, geom from private.trail_points where file like 'km:%SOBO%' and name ~ '^\d+$';
