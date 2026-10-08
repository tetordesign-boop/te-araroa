-- Admin-only helpers used by the mobile admin page
create or replace function public.admin_tracking_config()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'owntracks_password', (select value from private.secrets where key = 'owntracks_password'));
end $$;
revoke all on function public.admin_tracking_config() from public, anon;
grant execute on function public.admin_tracking_config() to authenticated;

create or replace function public.admin_storage_usage()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'bytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.bucket_id = 'media'), 0),
    'files', (select count(*) from storage.objects o where o.bucket_id = 'media'));
end $$;
revoke all on function public.admin_storage_usage() from public, anon;
grant execute on function public.admin_storage_usage() to authenticated;

grant select (id, day_id, author, body, hidden, created_at) on public.messages to authenticated;
grant update (hidden) on public.messages to authenticated;
grant delete on public.messages to authenticated;
