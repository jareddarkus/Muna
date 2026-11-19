-- Replies: the inline sub-select in the policy could not see the new row's post; use a helper function instead.
create function public.valid_parent(pid uuid, parent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.comments c where c.id = parent and c.post_id = pid and c.parent_id is null) $$;
revoke execute on function public.valid_parent(uuid, uuid) from public, anon;
grant execute on function public.valid_parent(uuid, uuid) to authenticated;

drop policy comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_post(post_id)
    and (parent_id is null or public.valid_parent(post_id, parent_id)));
