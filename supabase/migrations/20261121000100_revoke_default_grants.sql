-- Double security: the public (anon) never writes these tables directly. Row level security already refuses it (the
-- site writes only through the rate-limited functions), but the rights Supabase grants by default were still there,
-- held back by RLS alone. They go; reading what is published stays as it was. The admin (authenticated, checked by
-- is_admin() in every policy) keeps what the Carnet uses; nobody needs truncate, references or triggers.
revoke insert, update, delete, truncate, references, trigger on public.days, public.media, public.positions, public.settings from anon;
revoke all on public.admins from anon;
revoke truncate, references, trigger on public.days, public.media, public.positions, public.settings, public.admins from authenticated;
-- (an admin is added by the setup function, with the service role: never from the Carnet)
revoke insert, update, delete on public.admins from authenticated;
