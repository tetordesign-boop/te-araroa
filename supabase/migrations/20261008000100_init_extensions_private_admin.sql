-- Extensions
create extension if not exists postgis with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Private schema (never exposed through the API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Secrets used by edge functions (read through service-role-only RPC)
create table private.secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into private.secrets (key, value) values
  ('owntracks_password', replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', 'x'), '+', 'z')),
  ('import_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('ip_salt', encode(extensions.gen_random_bytes(16), 'hex')),
  ('admin_setup_code', upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8)));

-- Admins
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "admins can read themselves" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Service-role-only helpers for edge functions
create or replace function public.svc_get_secret(p_key text)
returns text
language sql stable security definer
set search_path = ''
as $$ select value from private.secrets where key = p_key; $$;
revoke all on function public.svc_get_secret(text) from public, anon, authenticated;
grant execute on function public.svc_get_secret(text) to service_role;

create or replace function public.svc_set_secret(p_key text, p_value text)
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into private.secrets(key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;
revoke all on function public.svc_set_secret(text, text) from public, anon, authenticated;
grant execute on function public.svc_set_secret(text, text) to service_role;

create or replace function public.svc_add_admin(p_user uuid)
returns void
language sql volatile security definer
set search_path = ''
as $$ insert into public.admins(user_id) values (p_user) on conflict do nothing; $$;
revoke all on function public.svc_add_admin(uuid) from public, anon, authenticated;
grant execute on function public.svc_add_admin(uuid) to service_role;
