-- Shared tasks are ONE task that everyone in it sees and edits live (unlike habits, which each person logs separately).
-- Access to a task (or step) = you own it, or you own / were invited (and accepted) to any task above it.
create function public.task_access(tid uuid) returns boolean language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select t.id, t.parent_id, t.owner_id from public.tasks t where t.id = tid
    union all
    select p.id, p.parent_id, p.owner_id from public.tasks p join up on p.id = up.parent_id
  )
  select exists (select 1 from up where up.owner_id = auth.uid()
                 or exists (select 1 from public.shares s where s.task_id = up.id and s.invitee_id = auth.uid() and s.status = 'accepted'))
$$;
revoke execute on function public.task_access(uuid) from public, anon;
grant execute on function public.task_access(uuid) to authenticated;

alter policy tasks_select on public.tasks using (owner_id = auth.uid() or public.task_access(id));
alter policy tasks_insert on public.tasks
  with check ((owner_id = auth.uid() and (parent_id is null or public.task_access(parent_id))) or public.task_access(id));
alter policy tasks_update on public.tasks using (owner_id = auth.uid() or public.task_access(id))
  with check ((owner_id = auth.uid() or public.task_access(id)) and (parent_id is null or public.task_access(parent_id)));
alter policy tasks_delete on public.tasks using (owner_id = auth.uid() or (parent_id is not null and public.task_access(id)));

-- nobody can hand a shared task over to themselves
create function public.keep_task_owner() returns trigger language plpgsql set search_path = ''
as $$ begin new.owner_id := old.owner_id; return new; end $$;
create trigger tasks_keep_owner before update on public.tasks for each row execute function public.keep_task_owner();

-- Accepting a task invitation no longer copies anything: the invitee simply gets access to the same task.
create or replace function public.respond_share(sid uuid, accept boolean)
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
    update public.shares set status = 'accepted' where id = sid;
  end if;
end $$;

-- People in a shared task: its owner and everyone who joined (the done state is the same for all of them).
create or replace function public.task_people(item uuid)
returns table (user_id uuid, status text, done boolean)
language sql stable security definer set search_path = ''
as $$
  with root as (select t.id, t.owner_id, (t.done_at is not null) as dn from public.tasks t where t.id = item and public.task_access(t.id))
  select root.owner_id, 'owner'::text, root.dn from root
  union all
  select s.invitee_id, s.status, root.dn from root join public.shares s on s.task_id = root.id
$$;

-- Nudge someone in a shared task (same rules as before; there is only one task now).
create or replace function public.send_nudge(kind text, item uuid, target uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare root uuid; tgt uuid; nid uuid;
begin
  if target = auth.uid() then raise exception 'You cannot remind yourself.'; end if;
  if kind = 'habit' then
    if not public.owns_habit(item) then raise exception 'Not your habit.'; end if;
    root := coalesce((select s.habit_id from public.shares s where s.copy_habit_id = item and s.status = 'accepted' limit 1), item);
    if target = (select h.owner_id from public.habits h where h.id = root) then tgt := root;
    else select s.copy_habit_id into tgt from public.shares s where s.habit_id = root and s.invitee_id = target and s.status = 'accepted'; end if;
    if tgt is null then raise exception 'They are not in this habit.'; end if;
    if exists (select 1 from public.habits h join public.habit_logs l on l.habit_id = h.id and l.day = current_date and l.value >= h.target where h.id = tgt) then
      raise exception 'They already did it today.'; end if;
    if exists (select 1 from public.nudges n where n.from_id = auth.uid() and n.to_id = target and n.habit_id = tgt and n.created_at > now() - interval '3 hours') then
      raise exception 'You reminded them a moment ago.'; end if;
    insert into public.nudges (to_id, habit_id, title, icon, color) select target, h.id, h.title, h.icon, h.color from public.habits h where h.id = tgt returning id into nid;
  elsif kind = 'task' then
    if not public.task_access(item) then raise exception 'Not your task.'; end if;
    if not (exists (select 1 from public.tasks t where t.id = item and t.owner_id = target)
            or exists (select 1 from public.shares s where s.task_id = item and s.invitee_id = target and s.status = 'accepted')) then
      raise exception 'They are not in this task.'; end if;
    if exists (select 1 from public.tasks t where t.id = item and t.done_at is not null) then raise exception 'It is already done.'; end if;
    if exists (select 1 from public.nudges n where n.from_id = auth.uid() and n.to_id = target and n.task_id = item and n.created_at > now() - interval '3 hours') then
      raise exception 'You reminded them a moment ago.'; end if;
    insert into public.nudges (to_id, task_id, title, icon, color) select target, t.id, t.title, t.icon, t.color from public.tasks t where t.id = item returning id into nid;
  else raise exception 'Unknown kind.'; end if;
  return nid;
end $$;
