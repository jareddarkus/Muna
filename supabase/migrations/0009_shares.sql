-- Invite friends to join a habit or a task. The invitee gets a pending invitation (shown in Social → Notifications);
-- on accepting, they get their own copy to log, and everyone in it can see who is done today.
create table public.shares (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references public.habits (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  inviter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  copy_habit_id uuid references public.habits (id) on delete set null,
  copy_task_id uuid references public.tasks (id) on delete set null,
  title text not null default '',        -- snapshot, so the invitee can see what it is before accepting
  icon text not null default 'outline:star',
  color text not null default 'purple',
  created_at timestamptz not null default now(),
  check (((habit_id is not null)::int + (task_id is not null)::int) = 1),
  check (inviter_id <> invitee_id)
);
create unique index shares_habit_invitee on public.shares (habit_id, invitee_id) where habit_id is not null;
create unique index shares_task_invitee on public.shares (task_id, invitee_id) where task_id is not null;
create index shares_invitee on public.shares (invitee_id);

create function public.owns_habit(hid uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.habits h where h.id = hid and h.owner_id = auth.uid()) $$;
revoke execute on function public.owns_habit(uuid) from public, anon;
grant execute on function public.owns_habit(uuid) to authenticated;
-- (owns_task(uuid) already exists from migration 0006)

alter table public.shares enable row level security;
create policy shares_select on public.shares for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());
create policy shares_insert on public.shares for insert to authenticated
  with check (inviter_id = auth.uid() and status = 'pending' and copy_habit_id is null and copy_task_id is null
    and public.are_friends(auth.uid(), invitee_id)
    and ((habit_id is not null and public.owns_habit(habit_id)) or (task_id is not null and public.owns_task(task_id))));
create policy shares_delete on public.shares for delete to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

alter publication supabase_realtime add table public.shares;
alter table public.shares replica identity full;

-- Accept (creates the invitee's own copy) or decline (removes the invitation).
create function public.respond_share(sid uuid, accept boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare s public.shares; cid uuid;
begin
  select * into s from public.shares where id = sid and invitee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'no such invitation'; end if;
  if not accept then delete from public.shares where id = sid; return; end if;
  if s.habit_id is not null then
    insert into public.habits (owner_id, title, icon, color, goal_type, target, unit, days, created_on)
      select auth.uid(), h.title, h.icon, h.color, h.goal_type, h.target, h.unit, h.days, current_date from public.habits h where h.id = s.habit_id
      returning id into cid;
    update public.shares set status = 'accepted', copy_habit_id = cid where id = sid;
  else
    with recursive tree as (
      select t.id, t.parent_id from public.tasks t where t.id = s.task_id
      union all
      select c.id, c.parent_id from public.tasks c join tree on c.parent_id = tree.id
    ), m as materialized (select tree.id, gen_random_uuid() as nid from tree),
    ins as (
      insert into public.tasks (id, owner_id, parent_id, title, icon, color, description, day, created_at)
      select m.nid, auth.uid(), case when t.id = s.task_id then null else pm.nid end, t.title, t.icon, t.color, t.description,
             case when t.day is not null and t.day < current_date then current_date else t.day end, t.created_at
      from tree join public.tasks t on t.id = tree.id join m on m.id = t.id left join m pm on pm.id = t.parent_id
      returning id
    )
    select m.nid into cid from m where m.id = s.task_id;
    update public.shares set status = 'accepted', copy_task_id = cid where id = sid;
  end if;
end $$;

-- Who is in this habit / task and are they done today (needs one of your own items: the original or your copy).
create function public.habit_people(item uuid)
returns table (user_id uuid, status text, done boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select h.id from public.habits h where h.id = item and h.owner_id = auth.uid()),
  root as (select coalesce((select s.habit_id from public.shares s where s.copy_habit_id = item and s.status = 'accepted' limit 1), (select id from me)) as hid)
  select h.owner_id, 'owner'::text,
         coalesce((select l.value >= h.target from public.habit_logs l where l.habit_id = h.id and l.user_id = h.owner_id and l.day = current_date), false)
  from root join public.habits h on h.id = root.hid
  union all
  select s.invitee_id, s.status,
         coalesce((select l.value >= ch.target from public.habits ch join public.habit_logs l on l.habit_id = ch.id and l.user_id = ch.owner_id and l.day = current_date where ch.id = s.copy_habit_id), false)
  from root join public.shares s on s.habit_id = root.hid
$$;
create function public.task_people(item uuid)
returns table (user_id uuid, status text, done boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select t.id from public.tasks t where t.id = item and t.owner_id = auth.uid()),
  root as (select coalesce((select s.task_id from public.shares s where s.copy_task_id = item and s.status = 'accepted' limit 1), (select id from me)) as tid)
  select t.owner_id, 'owner'::text, t.done_at is not null
  from root join public.tasks t on t.id = root.tid
  union all
  select s.invitee_id, s.status, coalesce((select ct.done_at is not null from public.tasks ct where ct.id = s.copy_task_id), false)
  from root join public.shares s on s.task_id = root.tid
$$;
revoke execute on function public.respond_share(uuid, boolean), public.habit_people(uuid), public.task_people(uuid) from public, anon;
grant execute on function public.respond_share(uuid, boolean), public.habit_people(uuid), public.task_people(uuid) to authenticated;
