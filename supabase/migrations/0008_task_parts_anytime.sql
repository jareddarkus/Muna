-- Tasks with no day count on the day they were finished (same rule as the app); tasks with a day count on that day.
create or replace function public.task_parts(u uuid)
returns table (sched int, done int)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone) then p.timezone else 'UTC' end as tz
    from public.profiles p where p.id = u
  ), t as (select me.tz, (now() at time zone me.tz)::date as today from me),
  k as (select coalesce(x.day, (x.done_at at time zone t.tz)::date) as eday, x.done_at from t join public.tasks x on x.owner_id = u)
  select (count(*) filter (where k.eday between t.today - 20 and t.today and (k.eday < t.today or k.done_at is not null)))::int,
         (count(*) filter (where k.eday between t.today - 20 and t.today and k.done_at is not null))::int
  from t left join k on true
$$;
