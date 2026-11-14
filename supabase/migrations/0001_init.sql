-- Muna: schema, row level security, realtime and avatar storage.

-- ───────────── profiles ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

-- Creates a profile for every new account (username is auto-generated, editable later).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), ''),
    '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 14);
  loop
    candidate := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where username = candidate);
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── friendships ─────────────
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id)
);
create unique index friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);

-- ───────────── groups ─────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

-- ───────────── habits ─────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  icon text not null default 'outline:circle-check',
  color text not null default 'blue'
    check (color in ('red','orange','yellow','lime','green','sky','blue','purple','pink','brown','gray')),
  goal_type text not null default 'count' check (goal_type in ('count', 'time')),
  target integer not null default 1 check (target > 0),   -- a number of times, or seconds for time goals
  unit text not null default '' check (char_length(unit) <= 20),
  days smallint[] not null default '{0,1,2,3,4,5,6}',      -- 0 = Sunday
  created_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index habits_owner on public.habits (owner_id);
create index habits_group on public.habits (group_id);

create table public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null,
  value integer not null default 0 check (value >= 0),     -- count, or seconds
  updated_at timestamptz not null default now(),
  primary key (habit_id, user_id, day)
);
create index habit_logs_user_day on public.habit_logs (user_id, day);

-- ───────────── helper functions (security definer avoids RLS recursion) ─────────────
create function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid()) $$;

create function public.is_group_owner(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) $$;

create function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  )
$$;

create function public.can_access_habit(hid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.habits h
    where h.id = hid
      and (h.owner_id = auth.uid() or (h.group_id is not null and public.is_group_member(h.group_id)))
  )
$$;

-- The creator of a group is automatically its first member.
create function public.add_group_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger on_group_created after insert on public.groups
  for each row execute function public.add_group_owner();

-- Join a group with its invite code.
create function public.join_group(code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into gid from public.groups where invite_code = lower(trim(code));
  if gid is null then raise exception 'invalid code'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end;
$$;

-- A group member can add one of their friends straight into the group.
create function public.add_group_member(gid uuid, uid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not public.are_friends(auth.uid(), uid) then raise exception 'not friends'; end if;
  insert into public.group_members (group_id, user_id) values (gid, uid) on conflict do nothing;
end;
$$;

-- Lock function execution down to signed-in users.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_group_member(uuid), public.is_group_owner(uuid), public.are_friends(uuid, uuid),
  public.can_access_habit(uuid), public.join_group(text), public.add_group_member(uuid, uuid)
  to authenticated;

-- ───────────── row level security ─────────────
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

-- profiles: any signed-in user can look people up by username; only you edit yours.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- friendships
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- groups
create policy groups_select on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy groups_update on public.groups for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()));

-- group members (adding happens through join_group / add_group_member only)
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_delete on public.group_members for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.uid()) or public.is_group_owner(group_id)));

-- habits: yours, plus the ones shared with a group you belong to
create policy habits_select on public.habits for select to authenticated
  using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));
create policy habits_insert on public.habits for insert to authenticated
  with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy habits_update on public.habits for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy habits_delete on public.habits for delete to authenticated
  using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_owner(group_id)));

-- logs: everyone in a shared habit sees everyone's progress, but only edits their own
create policy habit_logs_select on public.habit_logs for select to authenticated
  using (user_id = (select auth.uid()) or public.can_access_habit(habit_id));
create policy habit_logs_insert on public.habit_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_habit(habit_id));
create policy habit_logs_update on public.habit_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_habit(habit_id));
create policy habit_logs_delete on public.habit_logs for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────── realtime ─────────────
alter publication supabase_realtime add table
  public.profiles, public.friendships, public.groups, public.group_members, public.habits, public.habit_logs;

-- ───────────── avatar storage (public read, write only inside your own folder) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Trigger-only functions must not be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_group_owner() from public, anon, authenticated;

-- Profiles are not broadcast over realtime (they are readable by any signed-in user, so keep it quiet).
alter publication supabase_realtime drop table public.profiles;
