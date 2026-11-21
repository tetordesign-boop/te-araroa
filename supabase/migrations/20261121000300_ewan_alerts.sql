-- My alerts, in the Carnet: a notification on my phone when someone buys a ticket or asks for one, gives me a hand,
-- leaves me a note, asks me a question, or signs up for the site's notifications. The Carnet signs the phone up (admin_push: only I read or change
-- it, with the kinds I want); a trigger on each of those tables asks the "push" function to tell me, through pg_net:
-- the call is queued and sent after the visitor's insert is saved, so a message never waits for it, and a failure
-- never stops it. The trigger and the function share a secret made here, in private.secrets (it never leaves the
-- database and the function); the function also checks the kind, and keeps titles and texts short.
create table if not exists public.admin_push (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  kinds text[] not null default array['sponsor', 'gift', 'message', 'question']::text[]
    check (kinds <@ array['sponsor', 'gift', 'message', 'question', 'follower']::text[]),
  fails smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_push enable row level security;
drop policy if exists "Ewan reads his phones" on public.admin_push;
create policy "Ewan reads his phones" on public.admin_push for select to authenticated using ((select public.is_admin()));
drop policy if exists "Ewan adds a phone" on public.admin_push;
create policy "Ewan adds a phone" on public.admin_push for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Ewan changes a phone" on public.admin_push;
create policy "Ewan changes a phone" on public.admin_push for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Ewan removes a phone" on public.admin_push;
create policy "Ewan removes a phone" on public.admin_push for delete to authenticated using ((select public.is_admin()));
revoke all on public.admin_push from anon, authenticated;
grant select, insert, update, delete on public.admin_push to authenticated;

-- the shared secret (64 hexadecimal characters), made once
insert into private.secrets (key, value)
values ('admin_push_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function private.tell_ewan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text; v_title text; v_body text; v_url text; v_secret text; v_n integer;
begin
  if tg_table_name = 'sponsor_requests' then
    v_kind := 'sponsor';
    v_url := 'admin/#sponsors';
    if tg_op = 'INSERT' then
      if new.kind = 'buy' then return new; end if; -- a ticket being bought: told once it's paid
      v_title := 'Ticket gratuit demandé : ' || new.spot_label;
      v_body := new.name || coalesce(' : ' || new.message, '');
    elsif new.status = 'paid' then
      v_title := 'Ticket acheté : ' || new.spot_label;
      v_body := new.name || ', ' || coalesce(to_char(new.amount_cents / 100.0, 'FM999G990'), '?') || ' €' || coalesce(' : ' || new.message, '');
    elsif new.status = 'conflict' then
      v_title := 'À rembourser : ' || new.spot_label;
      v_body := new.name || ' a payé un ticket que quelqu''un venait de prendre.';
    else
      return new;
    end if;
  elsif tg_table_name = 'gifts' then
    v_kind := 'gift';
    v_title := 'Un coup de pouce de ' || to_char(new.amount_cents / 100.0, 'FM999G990') || ' €';
    v_body := coalesce(new.name, 'Quelqu''un') || coalesce(' : ' || new.message, '');
    v_url := 'admin/#sponsors';
  elsif tg_table_name = 'messages' then
    v_kind := 'message';
    select d.day_number into v_n from public.days d where d.id = new.day_id;
    v_title := 'Un mot de ' || new.author || coalesce(' (jour ' || v_n || ')', '');
    v_body := new.body;
    v_url := 'admin/#messages';
  elsif tg_table_name = 'questions' then
    v_kind := 'question';
    v_title := 'Une question de ' || new.author;
    v_body := new.body;
    v_url := 'admin/#questions';
  elsif tg_table_name = 'push_subs' then
    v_kind := 'follower';
    select count(*) into v_n from public.push_subs;
    v_title := 'Un nouvel abonné';
    v_body := v_n || case when v_n > 1 then ' téléphones suivent' else ' téléphone suit' end || ' tes étapes.';
    v_url := 'admin/';
  else
    return new;
  end if;
  -- nobody to tell
  if not exists (select 1 from public.admin_push a where v_kind = any (a.kinds)) then return new; end if;
  select s.value into v_secret from private.secrets s where s.key = 'admin_push_secret';
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://jmedorwtksxxnzwyjvbz.supabase.co/functions/v1/push',
    body := jsonb_build_object('action', 'ewan', 'kind', v_kind, 'title', left(v_title, 80), 'body', left(coalesce(v_body, ''), 160), 'url', v_url),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  return new; -- a notification never stops what the visitor sent
end $$;
revoke all on function private.tell_ewan() from public, anon, authenticated;

-- (after insert only: a phone renewing its subscription is an update, not a new follower)
drop trigger if exists tell_ewan on public.sponsor_requests;
create trigger tell_ewan after insert on public.sponsor_requests for each row execute function private.tell_ewan();
drop trigger if exists tell_ewan_paid on public.sponsor_requests;
create trigger tell_ewan_paid after update of status on public.sponsor_requests for each row
  when (new.status in ('paid', 'conflict') and old.status is distinct from new.status) execute function private.tell_ewan();
drop trigger if exists tell_ewan on public.gifts;
create trigger tell_ewan after insert on public.gifts for each row execute function private.tell_ewan();
drop trigger if exists tell_ewan on public.messages;
create trigger tell_ewan after insert on public.messages for each row execute function private.tell_ewan();
drop trigger if exists tell_ewan on public.questions;
create trigger tell_ewan after insert on public.questions for each row execute function private.tell_ewan();
drop trigger if exists tell_ewan on public.push_subs;
create trigger tell_ewan after insert on public.push_subs for each row execute function private.tell_ewan();
