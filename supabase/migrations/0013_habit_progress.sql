-- Everyone in a shared habit with today's count / time (so the habit screen can show how far each person is).
-- "Today" is the caller's own day (their profile timezone).
create function public.habit_progress(item uuid)
returns table (user_id uuid, status text, done boolean, value int, target int, goal_type text, unit text)
language sql stable security definer set search_path = ''
as $$
  with tz as (select case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone) then p.timezone else 'UTC' end as name from public.profiles p where p.id = auth.uid()),
  d as (select (now() at time zone tz.name)::date as today from tz),
  me as (select h.id from public.habits h where h.id = item and h.owner_id = auth.uid()),
  root as (select coalesce((select s.habit_id from public.shares s where s.copy_habit_id = item and s.status = 'accepted' limit 1), (select id from me)) as hid)
  select h.owner_id, 'owner'::text, coalesce(l.value >= h.target, false), coalesce(l.value, 0), h.target, h.goal_type, h.unit
  from root join public.habits h on h.id = root.hid cross join d
  left join public.habit_logs l on l.habit_id = h.id and l.user_id = h.owner_id and l.day = d.today
  union all
  select s.invitee_id, s.status, coalesce(l.value >= ch.target, false), coalesce(l.value, 0), coalesce(ch.target, 0), coalesce(ch.goal_type, 'count'), coalesce(ch.unit, '')
  from root join public.shares s on s.habit_id = root.hid cross join d
  left join public.habits ch on ch.id = s.copy_habit_id
  left join public.habit_logs l on l.habit_id = ch.id and l.user_id = ch.owner_id and l.day = d.today
$$;
revoke execute on function public.habit_progress(uuid) from public, anon;
grant execute on function public.habit_progress(uuid) to authenticated;
