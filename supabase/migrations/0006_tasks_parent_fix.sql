-- The parent check in the tasks policies compared the parent's own column with itself.
-- A helper function (security definer, so it never recurses through RLS) checks ownership properly.
create function public.owns_task(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tasks t where t.id = pid and t.owner_id = auth.uid()) $$;
revoke execute on function public.owns_task(uuid) from public, anon;
grant execute on function public.owns_task(uuid) to authenticated;

alter policy tasks_insert on public.tasks
  with check (owner_id = auth.uid() and (parent_id is null or public.owns_task(parent_id)));
alter policy tasks_update on public.tasks
  with check (owner_id = auth.uid() and (parent_id is null or public.owns_task(parent_id)));
