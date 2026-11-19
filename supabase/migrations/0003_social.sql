-- Social: About me, public/private groups with admins, invitations, join requests, posts, comments, likes,
-- and the 21-day completion rate. (Replaces the old invite-code groups.)

-- ───────────── profiles ─────────────
alter table public.profiles add column about text not null default '' check (char_length(about) <= 160);

-- ───────────── groups ─────────────
alter table public.groups
  add column description text not null default '' check (char_length(description) <= 200),
  add column icon text not null default 'outline:users',
  add column color text not null default 'purple' check (color in ('red','orange','yellow','green','blue','purple','pink')),
  add column is_public boolean not null default true;
create unique index groups_name_unique on public.groups (lower(btrim(name)));

alter table public.group_members drop constraint group_members_role_check;
update public.group_members set role = 'admin' where role = 'owner';
alter table public.group_members add constraint group_members_role_check check (role in ('admin', 'member'));
alter table public.group_members alter column role set default 'member';

create function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'admin') $$;

create or replace function public.add_group_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;

-- policies that depended on the old owner concept
drop policy groups_select on public.groups;
drop policy groups_update on public.groups;
drop policy groups_delete on public.groups;
drop policy group_members_delete on public.group_members;
drop policy habits_delete on public.habits;

-- anyone signed in can find a group (name, icon, description); what happens inside stays members-only
create policy groups_select on public.groups for select to authenticated using (true);
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (public.is_group_admin(id));
create policy habits_delete on public.habits for delete to authenticated using (owner_id = (select auth.uid()));

drop function public.join_group(text);
drop function public.add_group_member(uuid, uuid);
drop function public.is_group_owner(uuid);
alter table public.groups drop column invite_code;

-- ───────────── invitations and join requests ─────────────
create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);
create index group_invites_invitee on public.group_invites (invitee_id);
create table public.group_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_invites enable row level security;
alter table public.group_requests enable row level security;
create policy group_invites_select on public.group_invites for select to authenticated
  using (invitee_id = (select auth.uid()) or public.is_group_admin(group_id));
create policy group_invites_delete on public.group_invites for delete to authenticated
  using (invitee_id = (select auth.uid()) or public.is_group_admin(group_id));
create policy group_requests_select on public.group_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));
create policy group_requests_delete on public.group_requests for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));

-- ───────────── membership actions ─────────────
create function public.join_group(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare pub boolean;
begin
  select is_public into pub from public.groups where id = gid;
  if pub is null then raise exception 'no such group'; end if;
  if not pub and not exists (select 1 from public.group_invites where group_id = gid and invitee_id = auth.uid()) then
    raise exception 'private group';
  end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  delete from public.group_invites where group_id = gid and invitee_id = auth.uid();
  delete from public.group_requests where group_id = gid and user_id = auth.uid();
end;
$$;

create function public.request_join(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.groups where id = gid and not is_public) then raise exception 'not a private group'; end if;
  if public.is_group_member(gid) then raise exception 'already a member'; end if;
  insert into public.group_requests (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
end;
$$;

create function public.respond_request(gid uuid, uid uuid, accept boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'admins only'; end if;
  if accept and exists (select 1 from public.group_requests where group_id = gid and user_id = uid) then
    insert into public.group_members (group_id, user_id) values (gid, uid) on conflict do nothing;
  end if;
  delete from public.group_requests where group_id = gid and user_id = uid;
  delete from public.group_invites where group_id = gid and invitee_id = uid;
end;
$$;

create function public.invite_user(gid uuid, uid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'admins only'; end if;
  if exists (select 1 from public.group_members where group_id = gid and user_id = uid) then raise exception 'already a member'; end if;
  insert into public.group_invites (group_id, invitee_id, inviter_id) values (gid, uid, auth.uid()) on conflict do nothing;
end;
$$;

create function public.respond_invite(iid uuid, accept boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare inv public.group_invites;
begin
  select * into inv from public.group_invites where id = iid and invitee_id = auth.uid();
  if inv.id is null then raise exception 'no such invitation'; end if;
  if accept then
    insert into public.group_members (group_id, user_id) values (inv.group_id, auth.uid()) on conflict do nothing;
  end if;
  delete from public.group_invites where id = iid;
  delete from public.group_requests where group_id = inv.group_id and user_id = auth.uid();
end;
$$;

create function public.set_role(gid uuid, uid uuid, new_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'admins only'; end if;
  if new_role not in ('admin', 'member') then raise exception 'bad role'; end if;
  update public.group_members set role = new_role where group_id = gid and user_id = uid;
end;
$$;

create function public.kick_member(gid uuid, uid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'admins only'; end if;
  if exists (select 1 from public.group_members where group_id = gid and user_id = uid and role = 'admin') then
    raise exception 'admins cannot be removed';
  end if;
  delete from public.group_members where group_id = gid and user_id = uid;
end;
$$;

-- Leaving: the last admin hands the group to the longest-standing member; the last person out deletes it.
create function public.leave_group(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare others int; admins int; heir uuid;
begin
  if not public.is_group_member(gid) then return; end if;
  select count(*) into others from public.group_members where group_id = gid and user_id <> auth.uid();
  if others = 0 then delete from public.groups where id = gid; return; end if;
  select count(*) into admins from public.group_members where group_id = gid and role = 'admin' and user_id <> auth.uid();
  if admins = 0 then
    select user_id into heir from public.group_members where group_id = gid and user_id <> auth.uid() order by joined_at limit 1;
    update public.group_members set role = 'admin' where group_id = gid and user_id = heir;
  end if;
  delete from public.group_members where group_id = gid and user_id = auth.uid();
end;
$$;

-- ───────────── the 21-day rate ─────────────
-- Window: the 21 days ending today (in the person's own timezone). A scheduled day counts as "done" when the
-- goal was reached. Today only counts once it is done (so a morning isn't punished). Rounded UP, except that
-- 100% needs every scheduled day done (otherwise capped at 99).
create function public.pct_of(done int, sched int)
returns int language sql immutable set search_path = ''
as $$ select case when sched is null or sched = 0 then null when done >= sched then 100 else least(99, ceil(100.0 * done / sched))::int end $$;

create function public.avg_pct(vals int[])
returns int language sql immutable set search_path = ''
as $$
  select case
    when count(v) = 0 then null
    when min(v) = 100 then 100
    else least(99, ceil(avg(v)))::int
  end from unnest(vals) as v
$$;

create function public.rate_parts(u uuid)
returns table (habit_id uuid, sched int, done int)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone) then p.timezone else 'UTC' end as tz
    from public.profiles p where p.id = u
  ), t as (select (now() at time zone me.tz)::date as today from me),
  d as (select g::date as day, t.today from t, generate_series(t.today - 20, t.today, interval '1 day') g)
  select h.id,
    (count(*) filter (where h.created_on <= d.day and h.days @> array[extract(dow from d.day)::smallint]
                       and (d.day < d.today or coalesce(l.value, 0) >= h.target)))::int,
    (count(*) filter (where h.created_on <= d.day and h.days @> array[extract(dow from d.day)::smallint]
                       and coalesce(l.value, 0) >= h.target))::int
  from public.habits h
  cross join d
  left join public.habit_logs l on l.habit_id = h.id and l.user_id = u and l.day = d.day
  where h.owner_id = u
  group by h.id
$$;

create function public.user_pct(u uuid)
returns int language sql stable security definer set search_path = ''
as $$ select public.pct_of(sum(done)::int, sum(sched)::int) from public.rate_parts(u) $$;

-- someone's overall rate: yourself, your friends, or people in a group with you
create function public.member_rate(uid uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select case when uid = auth.uid() or public.are_friends(auth.uid(), uid)
              or exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
                         where a.user_id = auth.uid() and b.user_id = uid)
         then public.user_pct(uid) end
$$;

-- a friend's habits with their 21-day rate each (friends only)
create function public.friend_habits(uid uuid)
returns table (id uuid, title text, icon text, color text, goal_type text, target int, unit text, days smallint[], pct int)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.title, h.icon, h.color, h.goal_type, h.target, h.unit, h.days, public.pct_of(r.done, r.sched)
  from public.habits h join public.rate_parts(uid) r on r.habit_id = h.id
  where h.owner_id = uid and (uid = auth.uid() or public.are_friends(auth.uid(), uid))
  order by h.created_at
$$;

-- members of a group you belong to, with each member's overall rate (never their individual habits)
create function public.group_overview(gid uuid)
returns table (user_id uuid, role text, joined_at timestamptz, pct int)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.role, m.joined_at, public.user_pct(m.user_id)
  from public.group_members m where m.group_id = gid and public.is_group_member(gid)
  order by (m.role = 'admin') desc, m.joined_at
$$;

create function public.group_rates(gids uuid[])
returns table (gid uuid, member_count int, pct int)
language sql stable security definer set search_path = ''
as $$
  select g.id,
    (select count(*)::int from public.group_members x where x.group_id = g.id),
    (select public.avg_pct(array_agg(public.user_pct(x.user_id))) from public.group_members x where x.group_id = g.id)
  from public.groups g where g.id = any (gids)
$$;

create function public.search_groups(q text)
returns table (id uuid, name text, description text, icon text, color text, is_public boolean, member_count int, pct int, status text)
language sql stable security definer set search_path = ''
as $$
  with s as (select replace(replace(btrim(coalesce(q, '')), '%', '\%'), '_', '\_') as t)
  select g.id, g.name, g.description, g.icon, g.color, g.is_public,
    (select count(*)::int from public.group_members x where x.group_id = g.id),
    (select public.avg_pct(array_agg(public.user_pct(x.user_id))) from public.group_members x where x.group_id = g.id),
    case when public.is_group_member(g.id) then 'member'
         when exists (select 1 from public.group_invites i where i.group_id = g.id and i.invitee_id = auth.uid()) then 'invited'
         when exists (select 1 from public.group_requests r where r.group_id = g.id and r.user_id = auth.uid()) then 'requested'
         else 'none' end
  from public.groups g, s
  where s.t = '' or g.name ilike '%' || s.t || '%'
  order by (s.t <> '' and g.name ilike s.t || '%') desc,
           (select count(*) from public.group_members x where x.group_id = g.id) desc, g.name
  limit 12
$$;

-- groups whose name or description mentions a word from your own habit names (you never reveal which habit)
create function public.recommended_groups(words text[])
returns table (id uuid, name text, description text, icon text, color text, is_public boolean, member_count int, pct int, status text)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.name, g.description, g.icon, g.color, g.is_public,
    (select count(*)::int from public.group_members x where x.group_id = g.id),
    (select public.avg_pct(array_agg(public.user_pct(x.user_id))) from public.group_members x where x.group_id = g.id),
    case when exists (select 1 from public.group_invites i where i.group_id = g.id and i.invitee_id = auth.uid()) then 'invited'
         when exists (select 1 from public.group_requests r where r.group_id = g.id and r.user_id = auth.uid()) then 'requested'
         else 'none' end
  from public.groups g
  where not public.is_group_member(g.id)
    and exists (select 1 from unnest(words) w
                where length(w) >= 3 and (g.name ilike '%' || replace(replace(w, '%', '\%'), '_', '\_') || '%'
                                         or g.description ilike '%' || replace(replace(w, '%', '\%'), '_', '\_') || '%'))
  order by (select count(*) from public.group_members x where x.group_id = g.id) desc
  limit 8
$$;

-- ───────────── posts, comments, likes ─────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  habit_id uuid references public.habits (id) on delete set null,
  habit jsonb,                                   -- snapshot of the shared habit, so it can be copied
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or habit is not null)
);
create index posts_group on public.posts (group_id, created_at desc);
create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_post on public.comments (post_id, created_at);
create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

create function public.can_see_post(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.posts p where p.id = pid and public.is_group_member(p.group_id)) $$;
create function public.can_see_comment(cid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.comments c where c.id = cid and public.can_see_post(c.post_id)) $$;
create function public.post_group_admin(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.posts p where p.id = pid and public.is_group_admin(p.group_id)) $$;

create function public.post_rates(pids uuid[])
returns table (post_id uuid, pct int)
language sql stable security definer set search_path = ''
as $$
  select p.id, (select public.pct_of(r.done, r.sched) from public.rate_parts(p.author_id) r where r.habit_id = p.habit_id)
  from public.posts p where p.id = any (pids) and public.is_group_member(p.group_id)
$$;

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

create policy posts_select on public.posts for select to authenticated using (public.is_group_member(group_id));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_group_member(group_id)
    and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.owner_id = (select auth.uid()))));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_group_admin(group_id));

create policy post_likes_select on public.post_likes for select to authenticated using (public.can_see_post(post_id));
create policy post_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_post(post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy comments_select on public.comments for select to authenticated using (public.can_see_post(post_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_post(post_id)
    and (parent_id is null or exists (select 1 from public.comments c where c.id = parent_id and c.post_id = comments.post_id and c.parent_id is null)));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.post_group_admin(post_id));

create policy comment_likes_select on public.comment_likes for select to authenticated using (public.can_see_comment(comment_id));
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_comment(comment_id));
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── permissions ─────────────
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.pct_of(int, int), public.avg_pct(int[]), public.rate_parts(uuid), public.user_pct(uuid) from authenticated;
revoke execute on function public.handle_new_user(), public.add_group_owner(), public.claim_due_reminders() from authenticated;
grant execute on function
  public.is_group_admin(uuid), public.join_group(uuid), public.request_join(uuid), public.respond_request(uuid, uuid, boolean),
  public.invite_user(uuid, uuid), public.respond_invite(uuid, boolean), public.set_role(uuid, uuid, text), public.kick_member(uuid, uuid),
  public.leave_group(uuid), public.member_rate(uuid), public.friend_habits(uuid), public.group_overview(uuid), public.group_rates(uuid[]),
  public.search_groups(text), public.recommended_groups(text[]), public.can_see_post(uuid), public.can_see_comment(uuid),
  public.post_group_admin(uuid), public.post_rates(uuid[])
  to authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.claim_due_reminders() to service_role;

-- ───────────── realtime ─────────────
alter publication supabase_realtime drop table public.groups;
alter publication supabase_realtime add table
  public.posts, public.comments, public.post_likes, public.comment_likes, public.group_invites, public.group_requests;
