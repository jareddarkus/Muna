-- Tasks get an optional time of day (for the Day view) and can be marked as a project (for the Projects tab).
alter table public.tasks
  add column due_time text check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column project boolean not null default false;
