-- Redesign 2/5: the two-tier task model that replaces the question system.
--
--   daily_tasks       -> reset every day, checked off per day
--   assignments       -> persistent 'read'/'listen' items, done once, carry over
--
-- Points live only on the parent (task/assignment) rows; completions never carry
-- a client-supplied point value, so there is nothing to forge.

create type assignment_kind_t as enum ('read', 'listen');

create table daily_tasks (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade default app_program(),
  title       text not null check (length(title) between 1 and 240),
  description text not null default '' check (length(description) <= 2000),
  points      numeric(8,2) not null default 0 check (points >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table daily_completions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references students(id) on delete cascade,
  task_id    uuid not null references daily_tasks(id) on delete cascade,
  done_date  date not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, done_date)
);

create table assignments (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade default app_program(),
  kind        assignment_kind_t not null,
  title       text not null check (length(title) between 1 and 240),
  body_text   text not null default '' check (length(body_text) <= 8000),
  points      numeric(8,2) not null default 0 check (points >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table assignment_completions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references students(id) on delete cascade,
  assignment_id uuid not null references assignments(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  unique (user_id, assignment_id)
);

create index on daily_tasks (schedule_id, sort_order) where archived_at is null;
create index on daily_completions (user_id, done_date);
create index on daily_completions (task_id, done_date);
create index on assignments (schedule_id, sort_order) where archived_at is null;
create index on assignment_completions (user_id);
create index on assignment_completions (assignment_id);

-- A regular user may only tick a daily task on its own day; admins (e.g. for a
-- correction) are unrestricted. The program timezone defines "today".
create or replace function daily_completions_guard() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare tz text; today date;
begin
  if is_admin() then
    return new;
  end if;
  select timezone into tz from schedules where id = app_program();
  today := (now() at time zone coalesce(tz, 'Asia/Riyadh'))::date;
  if new.done_date <> today then
    raise exception 'لا يمكن تسجيل المهمة إلا في يومها';
  end if;
  return new;
end $$;

create trigger daily_completions_guard_t
  before insert or update on daily_completions
  for each row execute function daily_completions_guard();
