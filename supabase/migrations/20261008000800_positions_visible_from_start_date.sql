-- Positions only become public from the day of departure (tests at home stay private),
-- and always after the optional privacy delay.
alter policy "positions are public after the privacy delay" on public.positions
  using (
    (select public.is_admin())
    or (
      recorded_at <= now() - make_interval(mins => (select s.position_delay_minutes from public.settings s where s.id = 1))
      and recorded_at >= coalesce(
        (select (s.start_date::timestamp at time zone 'Pacific/Auckland') from public.settings s where s.id = 1),
        'infinity'::timestamptz)
    )
  );
