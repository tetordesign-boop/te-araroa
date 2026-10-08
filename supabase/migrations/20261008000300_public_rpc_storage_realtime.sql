-- Hash of the caller's IP (for rate limiting only, never exposed)
create or replace function private.caller_ip_hash()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  ip text := coalesce(nullif(h->>'cf-connecting-ip', ''),
                      nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
                      nullif(h->>'x-real-ip', ''),
                      'unknown');
begin
  return encode(extensions.digest(ip || coalesce((select value from private.secrets where key = 'ip_salt'), ''), 'sha256'), 'hex');
end $$;

-- ============ Post a message ============
create or replace function public.post_message(p_day uuid, p_author text, p_body text, p_device uuid)
returns table (id uuid, day_id uuid, author text, body text, created_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_hash text := private.caller_ip_hash();
  v_author text := btrim(regexp_replace(coalesce(p_author, ''), '\s+', ' ', 'g'));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if p_day is not null and not exists (select 1 from public.days d where d.id = p_day and d.published) then
    raise exception 'unknown_day';
  end if;
  if char_length(v_author) < 1 or char_length(v_author) > 40 then raise exception 'bad_author'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 800 then raise exception 'bad_body'; end if;
  if (select count(*) from regexp_matches(v_body, 'https?://', 'g')) > 2 then raise exception 'too_many_links'; end if;
  if (select count(*) from public.messages m
      where (m.ip_hash = v_hash or m.device_id = p_device) and m.created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.messages m where m.ip_hash = v_hash and m.created_at > now() - interval '1 day') >= 60 then
    raise exception 'rate_limited';
  end if;
  return query
    insert into public.messages as m (day_id, author, body, device_id, ip_hash)
    values (p_day, v_author, v_body, p_device, v_hash)
    returning m.id, m.day_id, m.author, m.body, m.created_at;
end $$;
revoke all on function public.post_message(uuid, text, text, uuid) from public;
grant execute on function public.post_message(uuid, text, text, uuid) to anon, authenticated;

-- ============ Reactions ============
create or replace function public.toggle_reaction(p_day uuid, p_emoji text, p_device uuid)
returns table (emoji_key text, total int, mine boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := private.caller_ip_hash();
begin
  if p_device is null then raise exception 'no_device'; end if;
  if p_emoji not in ('heart','clap','fire','wow') then raise exception 'bad_emoji'; end if;
  if not exists (select 1 from public.days d where d.id = p_day and d.published) then raise exception 'unknown_day'; end if;
  if exists (select 1 from public.reactions r where r.day_id = p_day and r.emoji = p_emoji and r.device_id = p_device) then
    delete from public.reactions r where r.day_id = p_day and r.emoji = p_emoji and r.device_id = p_device;
  else
    if (select count(*) from public.reactions r where r.ip_hash = v_hash and r.created_at > now() - interval '1 hour') >= 150 then
      raise exception 'rate_limited';
    end if;
    insert into public.reactions (day_id, emoji, device_id, ip_hash) values (p_day, p_emoji, p_device, v_hash);
  end if;
  return query
    select e.k,
           (select count(*)::int from public.reactions r where r.day_id = p_day and r.emoji = e.k),
           exists (select 1 from public.reactions r where r.day_id = p_day and r.emoji = e.k and r.device_id = p_device)
    from unnest(array['heart','clap','fire','wow']) as e(k);
end $$;
revoke all on function public.toggle_reaction(uuid, text, uuid) from public;
grant execute on function public.toggle_reaction(uuid, text, uuid) to anon, authenticated;

create or replace function public.get_reactions(p_device uuid default null)
returns table (day_id uuid, emoji_key text, total int, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.day_id, r.emoji, count(*)::int, coalesce(bool_or(r.device_id = p_device), false)
  from public.reactions r
  join public.days d on d.id = r.day_id and d.published
  group by r.day_id, r.emoji;
$$;
revoke all on function public.get_reactions(uuid) from public;
grant execute on function public.get_reactions(uuid) to anon, authenticated;

create or replace function public.get_message_counts()
returns table (day_id uuid, total int)
language sql stable security definer set search_path = '' as $$
  select m.day_id, count(*)::int from public.messages m
  join public.days d on d.id = m.day_id and d.published
  where not m.hidden group by m.day_id;
$$;
revoke all on function public.get_message_counts() from public;
grant execute on function public.get_message_counts() to anon, authenticated;

-- ============ Storage ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', true, 52428800,
    array['image/jpeg','image/webp','image/png','image/avif','video/mp4','video/quicktime','video/webm']),
  ('site', 'site', true, 20971520,
    array['application/json','application/geo+json','text/plain'])
on conflict (id) do nothing;

create policy "admins read site files" on storage.objects
  for select to authenticated using (bucket_id in ('media','site') and (select public.is_admin()));
create policy "admins upload site files" on storage.objects
  for insert to authenticated with check (bucket_id in ('media','site') and (select public.is_admin()));
create policy "admins update site files" on storage.objects
  for update to authenticated using (bucket_id in ('media','site') and (select public.is_admin()))
  with check (bucket_id in ('media','site') and (select public.is_admin()));
create policy "admins delete site files" on storage.objects
  for delete to authenticated using (bucket_id in ('media','site') and (select public.is_admin()));

-- ============ Realtime ============
alter publication supabase_realtime add table public.positions, public.days, public.media;
