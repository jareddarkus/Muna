-- Tasks: one-off things to do. A task can have steps, steps can have sub-steps, and so on (parent_id).
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  icon text not null default 'outline:list-check',
  description text not null default '' check (char_length(description) <= 1000),
  day date,                                   -- the day it should be done (steps may have none)
  done_at timestamptz,                        -- set when completed
  created_at timestamptz not null default now()
);
create index tasks_owner on public.tasks (owner_id, day);
create index tasks_parent on public.tasks (parent_id);

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (owner_id = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (owner_id = auth.uid() and (parent_id is null or exists (select 1 from public.tasks p where p.id = parent_id and p.owner_id = auth.uid())));
create policy tasks_update on public.tasks for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (parent_id is null or exists (select 1 from public.tasks p where p.id = parent_id and p.owner_id = auth.uid())));
create policy tasks_delete on public.tasks for delete to authenticated using (owner_id = auth.uid());

alter publication supabase_realtime add table public.tasks;
alter table public.tasks replica identity full;

-- Tasks can be shared to a group as a snapshot (title, icon, description and nested steps) that others can copy.
alter table public.posts add column task jsonb;
alter table public.posts drop constraint posts_check;
alter table public.posts add constraint posts_content check (char_length(btrim(body)) > 0 or habit is not null or task is not null);

-- Tasks count in the 21-day rate: every task / step with a day in the window is one item,
-- done once completed. Like habits, today only counts once it is done.
create function public.task_parts(u uuid)
returns table (sched int, done int)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone) then p.timezone else 'UTC' end as tz
    from public.profiles p where p.id = u
  ), t as (select (now() at time zone me.tz)::date as today from me)
  select (count(*) filter (where k.day < t.today or k.done_at is not null))::int,
         (count(*) filter (where k.done_at is not null))::int
  from t left join public.tasks k on k.owner_id = u and k.day between t.today - 20 and t.today
$$;
revoke execute on function public.task_parts(uuid) from public, anon, authenticated;

create or replace function public.user_pct(u uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select public.pct_of(
    (coalesce((select sum(done) from public.rate_parts(u)), 0) + coalesce((select done from public.task_parts(u)), 0))::int,
    (coalesce((select sum(sched) from public.rate_parts(u)), 0) + coalesce((select sched from public.task_parts(u)), 0))::int)
$$;
