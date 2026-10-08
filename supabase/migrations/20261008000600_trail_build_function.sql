-- Builds the South Island route (Ship Cove → Bluff) from the official Te Araroa GPX
-- (Te Araroa Trust, CC BY 4.0) ingested by the trail-import edge function.
create or replace function public.svc_trail_build(p_run uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_run uuid := p_run;
  v_k0 float8;
  v_total float8;
  v_parts jsonb;
  v_legs jsonb;
  v_places jsonb;
  v_gaps jsonb;
  v_version text;
begin
  if v_run is null then
    select run_id into v_run from private.trail_tracks order by created_at desc, id desc limit 1;
  end if;
  if v_run is null then raise exception 'no trail data ingested'; end if;

  select coalesce(substring(file from '(\d{4}_\d{2})'), '') into v_version
  from private.trail_tracks where run_id = v_run and file like 'tracks:%' limit 1;
  v_version := replace(v_version, '_', '-');

  -- South Island tracks, oriented south-bound, with official SOBO km range
  create temp table _tr on commit drop as
  select t.id, t.name,
         (regexp_match(t.descr, '([0-9.]+)\s*km to ([0-9.]+)\s*km'))[1]::float8 as a,
         (regexp_match(t.descr, '([0-9.]+)\s*km to ([0-9.]+)\s*km'))[2]::float8 as b,
         t.geom
  from private.trail_tracks t
  where t.run_id = v_run and t.file like 'tracks:%'
    and extensions.st_x(extensions.st_centroid(t.geom)) < 174.5
    and extensions.st_y(extensions.st_centroid(t.geom)) < -40.5
    and t.descr ~ '[0-9.]+\s*km to [0-9.]+\s*km';

  -- orientation check against the official km markers (numbered from Bluff = 0)
  create temp table _km on commit drop as
    select p.name::int as km, p.geom from private.trail_points p
    where p.run_id = v_run and p.file like 'km:%SOBO%' and p.name ~ '^\d+$';
  create index on _km using gist (geom);
  update _tr set geom = extensions.st_reverse(geom)
  where (select k.km from _km k order by k.geom operator(extensions.<->) extensions.st_startpoint(_tr.geom) limit 1)
      < (select k.km from _km k order by k.geom operator(extensions.<->) extensions.st_endpoint(_tr.geom) limit 1);

  select min(a) into v_k0 from _tr;
  select max(b) - min(a) into v_total from _tr;

  -- vertices with interpolated km (relative to Ship Cove)
  create temp table _v on commit drop as
  with pts as (
    select tr.id, tr.name, tr.a, tr.b, (dp).path[1] as i, (dp).geom as g
    from _tr tr, lateral extensions.st_dumppoints(tr.geom) dp
  ), seg as (
    select pts.*, coalesce(extensions.st_distance(g::extensions.geography,
             (lag(g) over (partition by id order by i))::extensions.geography), 0) as d
    from pts
  ), cum as (
    select seg.*, sum(d) over (partition by id order by i) as cd, sum(d) over (partition by id) as td from seg
  )
  select id, name, a, b, i, extensions.st_x(g) as x, extensions.st_y(g) as y,
         (a - v_k0) + case when td > 0 then cd / td else 0 end * (b - a) as km
  from cum;

  -- split into continuous parts (new part when consecutive tracks are > 150 m apart)
  create temp table _o on commit drop as
  with ordered as (
    select id, name, a, b, geom, row_number() over (order by a, b) as rn from _tr
  ), gaps as (
    select o.*, coalesce(extensions.st_distance(extensions.st_startpoint(o.geom)::extensions.geography,
             extensions.st_endpoint(lag(o.geom) over (order by rn))::extensions.geography), 0) as jump
    from ordered o
  )
  select id, name, a, b, rn, jump, sum(case when jump > 150 then 1 else 0 end) over (order by rn) as part from gaps;

  select jsonb_agg(p.coords order by p.part) into v_parts
  from (
    select o.part, jsonb_agg(jsonb_build_array(round(v.x::numeric, 5), round(v.y::numeric, 5), round(v.km::numeric, 3))
                             order by o.rn, v.i) as coords
    from _o o join _v v on v.id = o.id
    group by o.part
  ) p;

  select jsonb_agg(jsonb_build_object('n', btrim(regexp_replace(name, '\s+', ' ', 'g')),
                                      'k0', round((a - v_k0)::numeric, 1), 'k1', round((b - v_k0)::numeric, 1)) order by rn)
  into v_legs from _o;

  select coalesce(jsonb_agg(jsonb_build_object('km', round((a - v_k0)::numeric, 1), 'm', round(jump::numeric)) order by rn), '[]'::jsonb)
  into v_gaps from _o where jump > 150;

  -- key places (official SOBO km) → coordinates on the route (ties resolved towards the earlier track)
  with places(name, sobo) as (values
    ('Ship Cove · Meretoto', 1739.0), ('Anakiwa', 1808.6), ('Havelock', 1830.0), ('Pelorus Bridge', 1850.2),
    ('St Arnaud', 1991.2), ('Waiau Pass', 2043.5), ('Boyle Village', 2121.2), ('Arthur''s Pass (Klondyke Corner)', 2233.8),
    ('Lake Coleridge · Rakaia', 2298.3), ('Rangitata', 2367.8), ('Lake Tekapo', 2441.7), ('Twizel', 2500.4),
    ('Lake Ohau', 2523.8), ('Lake Hāwea', 2607.9), ('Wānaka', 2641.8), ('Arrowtown', 2704.1),
    ('Queenstown', 2733.8), ('Mavora Lakes', 2784.8), ('Riverton · Aparima', 3004.5),
    ('Invercargill', 3037.2), ('Bluff · Stirling Point', 3073.2)
  ), pk as (
    select p.name, p.sobo - v_k0 as km from places p where p.sobo between v_k0 and v_k0 + v_total + 0.01
  )
  select jsonb_agg(jsonb_build_object('n', pk.name, 'km', round(pk.km::numeric, 1),
           'c', (select jsonb_build_array(round(v.x::numeric, 5), round(v.y::numeric, 5))
                 from _v v order by round(abs(v.km - pk.km)::numeric, 3), v.a, v.i desc limit 1)) order by pk.km)
  into v_places from pk;

  update public.settings set trail_total_km = round(v_total::numeric, 1), trail_version = v_version, trail_updated_at = now() where id = 1;

  return jsonb_build_object(
    'route', jsonb_build_object(
      'v', v_version,
      'source', 'Te Araroa Trust · teararoa.org.nz · CC BY 4.0',
      'sobo_offset', v_k0,
      'total_km', round(v_total::numeric, 1),
      'parts', v_parts,
      'legs', v_legs,
      'gaps', v_gaps,
      'places', v_places),
    'km', null,
    'meta', jsonb_build_object('run', v_run, 'version', v_version, 'tracks', (select count(*) from _tr),
                               'vertices', (select count(*) from _v), 'parts', jsonb_array_length(v_parts),
                               'total_km', v_total, 'k0', v_k0, 'gaps', v_gaps));
end $$;
revoke all on function public.svc_trail_build(uuid) from public, anon, authenticated;
grant execute on function public.svc_trail_build(uuid) to service_role;
