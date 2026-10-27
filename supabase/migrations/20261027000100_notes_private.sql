-- Notes to Ewan are private: family and friends write them from the site (post_message, unchanged, rate limited),
-- and only Ewan reads them, in the Carnet. A visitor can't read them back, nor count them.
drop policy if exists "visible messages are public" on public.messages;
create policy "only Ewan reads the notes" on public.messages
  for select to authenticated using ((select public.is_admin()));
revoke select on public.messages from anon;
revoke execute on function public.get_message_counts() from anon, authenticated;
