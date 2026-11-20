-- `target` was ambiguous between the argument and habits.target; prefer the argument.
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
    if not public.owns_task(item) then raise exception 'Not your task.'; end if;
    root := coalesce((select s.task_id from public.shares s where s.copy_task_id = item and s.status = 'accepted' limit 1), item);
    if target = (select t.owner_id from public.tasks t where t.id = root) then tgt := root;
    else select s.copy_task_id into tgt from public.shares s where s.task_id = root and s.invitee_id = target and s.status = 'accepted'; end if;
    if tgt is null then raise exception 'They are not in this task.'; end if;
    if exists (select 1 from public.tasks t where t.id = tgt and t.done_at is not null) then raise exception 'They already did it.'; end if;
    if exists (select 1 from public.nudges n where n.from_id = auth.uid() and n.to_id = target and n.task_id = tgt and n.created_at > now() - interval '3 hours') then
      raise exception 'You reminded them a moment ago.'; end if;
    insert into public.nudges (to_id, task_id, title, icon, color) select target, t.id, t.title, t.icon, t.color from public.tasks t where t.id = tgt returning id into nid;
  else raise exception 'Unknown kind.'; end if;
  return nid;
end $$;
