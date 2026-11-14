-- Reminders + web push. (Start dates reuse habits.created_on.)

alter table public.profiles add column timezone text not null default 'UTC';

-- One optional reminder time per habit per person (members of a shared habit set their own).
create table public.habit_reminders (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  remind_at time not null,
  primary key (habit_id, user_id)
);
create index habit_reminders_user on public.habit_reminders (user_id);

-- Browsers/devices that agreed to receive notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- Server-only tables (RLS on, no policies: only the service role can touch them).
create table public.reminder_log (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (habit_id, user_id, day)
);
create table public.app_secrets (key text primary key, value text not null);
alter table public.reminder_log enable row level security;
alter table public.app_secrets enable row level security;
revoke all on public.reminder_log, public.app_secrets from anon, authenticated;

alter table public.habit_reminders enable row level security;
alter table public.push_subscriptions enable row level security;

create policy habit_reminders_select on public.habit_reminders for select to authenticated
  using (user_id = (select auth.uid()));
create policy habit_reminders_insert on public.habit_reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_habit(habit_id));
create policy habit_reminders_update on public.habit_reminders for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_habit(habit_id));
create policy habit_reminders_delete on public.habit_reminders for delete to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Registering a device (also re-assigns it if someone else signed in on the same browser before).
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Called every minute by the scheduler (through the edge function): finds reminders that are due in the
-- person's own timezone, skips habits already completed today, records them so they fire once, and returns
-- one row per device to notify.
create function public.claim_due_reminders()
returns table (sub_id uuid, endpoint text, p256dh text, auth text, habit_id uuid, user_id uuid, title text, body text)
language sql security definer set search_path = ''
as $$
  with local as (
    select r.habit_id, r.user_id, r.remind_at, h.title, h.target, h.days, h.created_on,
      (now() at time zone (case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone)
                                then p.timezone else 'UTC' end)) as lnow
    from public.habit_reminders r
    join public.habits h on h.id = r.habit_id
    join public.profiles p on p.id = r.user_id
  ), due as (
    select d.*, d.lnow::date as day
    from local d
    where extract(epoch from d.lnow::time) - extract(epoch from d.remind_at) between 0 and 600
      and d.days @> array[extract(dow from d.lnow)::smallint]
      and d.created_on <= d.lnow::date
  ), claimed as (
    insert into public.reminder_log (habit_id, user_id, day)
    select d.habit_id, d.user_id, d.day from due d
    where not exists (
      select 1 from public.habit_logs l
      where l.habit_id = d.habit_id and l.user_id = d.user_id and l.day = d.day and l.value >= d.target)
    on conflict do nothing
    returning habit_id, user_id
  )
  select s.id, s.endpoint, s.p256dh, s.auth, c.habit_id, c.user_id, d.title, 'Time to check in.'::text
  from claimed c
  join due d on d.habit_id = c.habit_id and d.user_id = c.user_id
  join public.push_subscriptions s on s.user_id = c.user_id
$$;
revoke execute on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

alter publication supabase_realtime add table public.habit_reminders;

-- ───────────── scheduler: poke the edge function once a minute (only if any reminder exists) ─────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into public.app_secrets (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict do nothing;

select cron.schedule('muna-reminders', '* * * * *', $job$
  select net.http_post(
    url := 'https://vqtepepiagjsljvauqyn.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
    body := jsonb_build_object('action', 'tick'),
    timeout_milliseconds := 20000)
  where exists (select 1 from public.habit_reminders)
$job$);
