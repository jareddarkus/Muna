-- Tasks can have a color, like habits.
alter table public.tasks add column color text not null default 'purple'
  check (color in ('red','orange','yellow','lime','green','sky','blue','purple','pink','brown','gray'));
