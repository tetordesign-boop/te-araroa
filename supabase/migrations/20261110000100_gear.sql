-- "Mon sac": Ewan's gear list (and the photo of it laid out), written in the Carnet, shown on the site's pack page.
-- One JSON value on the settings row: the row's policies already let anyone read it and only the admins change it.
alter table public.settings add column if not exists gear jsonb;
