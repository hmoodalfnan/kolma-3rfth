-- Qawafel: core schema
create extension if not exists pgcrypto;

create type app_role_t        as enum ('super_admin', 'manager');
create type schedule_status_t as enum ('active', 'archived');
create type question_type_t   as enum
  ('bool', 'per_prayer', 'single_choice', 'multi_choice', 'counter', 'rating', 'text');

-- Staff identities. id matches auth.users.id.
create table app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  role         app_role_t not null,
  is_active    boolean not null default true,
  created_by   uuid references app_users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table schedules (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 160),
  slug                     text not null unique check (slug ~ '^[0-9a-z]{10,32}$'),
  start_date               date not null,
  end_date                 date,                       -- NULL = open-ended
  timezone                 text not null default 'Asia/Riyadh',
  status                   schedule_status_t not null default 'active',
  streak_threshold_pct     int  not null default 100 check (streak_threshold_pct between 1 and 100),
  backfill_days            int  not null default 3   check (backfill_days between 0 and 365),
  students_see_leaderboard boolean not null default true,
  created_by               uuid references app_users(id) on delete set null,
  created_at               timestamptz not null default now(),
  archived_at              timestamptz,
  constraint schedules_dates_ordered check (end_date is null or end_date >= start_date)
);

-- Many-to-many: a manager may run several schedules; a schedule may have several managers.
create table schedule_staff (
  schedule_id uuid not null references schedules(id) on delete cascade,
  user_id     uuid not null references app_users(id) on delete cascade,
  group_scope uuid[],                                  -- NULL = whole schedule
  created_at  timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

create table groups (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  sort_order  int  not null default 0,
  join_slug   text unique check (join_slug is null or join_slug ~ '^[0-9a-z]{10,32}$'),
  created_at  timestamptz not null default now(),
  unique (schedule_id, name)
);

create table students (
  id                   uuid primary key default gen_random_uuid(),
  schedule_id          uuid not null references schedules(id) on delete cascade,
  group_id             uuid references groups(id) on delete set null,
  auth_uid             uuid unique references auth.users(id) on delete set null,
  full_name            text not null check (length(full_name) between 1 and 120),
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);

-- Super admin's master set. Managers copy from it; copies are independent.
create table question_library (
  id         uuid primary key default gen_random_uuid(),
  section    text not null default '' check (length(section) <= 120),
  title      text not null check (length(title) between 1 and 240),
  help_text  text not null default '' check (length(help_text) <= 500),
  type       question_type_t not null,
  config     jsonb not null default '{}'::jsonb,
  points     numeric(8,2) not null default 0,
  sort_order int not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table questions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references schedules(id) on delete cascade,
  library_id      uuid references question_library(id) on delete set null,
  section         text not null default '' check (length(section) <= 120),
  title           text not null check (length(title) between 1 and 240),
  help_text       text not null default '' check (length(help_text) <= 500),
  type            question_type_t not null,
  config          jsonb not null default '{}'::jsonb,
  points          numeric(8,2) not null default 0,
  active_weekdays int[] check (
                    active_weekdays is null
                    or (array_length(active_weekdays, 1) between 1 and 7
                        and active_weekdays <@ array[0,1,2,3,4,5,6])
                  ),
  active_from     date,
  active_to       date,
  is_required     boolean not null default false,
  sort_order      int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint questions_active_range
    check (active_to is null or active_from is null or active_to >= active_from)
);

create table answers (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(id) on delete cascade,
  question_id       uuid not null references questions(id) on delete cascade,
  entry_date        date not null,
  value             jsonb not null,
  points            numeric(8,2) not null default 0,
  client_updated_at timestamptz not null default now(),
  device_id         text check (device_id is null or length(device_id) <= 64),
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  unique (student_id, question_id, entry_date)
);

create table criteria (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references schedules(id) on delete cascade,
  name           text not null check (length(name) between 1 and 120),
  allow_negative boolean not null default true,
  sort_order     int not null default 0,
  archived_at    timestamptz,
  unique (schedule_id, name)
);

create table point_events (
  id                 uuid primary key default gen_random_uuid(),
  schedule_id        uuid not null references schedules(id) on delete cascade,
  student_id         uuid references students(id) on delete cascade,
  group_id           uuid references groups(id) on delete cascade,
  criterion_id       uuid not null references criteria(id) on delete restrict,
  points             numeric(8,2) not null check (points <> 0),
  note               text not null default '' check (length(note) <= 500),
  applied_to_members boolean not null default false,
  parent_event_id    uuid references point_events(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint point_events_one_target check (
    (student_id is not null and group_id is null)
    or (student_id is null and group_id is not null)
  )
);

-- Negative grants are impossible against a criterion that forbids them.
create or replace function point_events_check_sign() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare allowed boolean;
begin
  select allow_negative into allowed from criteria where id = new.criterion_id;
  if allowed is null then
    raise exception 'criterion % not found', new.criterion_id;
  end if;
  if not allowed and new.points < 0 then
    raise exception 'هذا البند لا يسمح بالخصم';
  end if;
  return new;
end $$;

create trigger point_events_sign_guard
  before insert or update on point_events
  for each row execute function point_events_check_sign();

create index on schedule_staff (user_id);
create index on groups (schedule_id, sort_order);
create index on students (schedule_id, is_active);
create index on students (group_id);
create index on students (auth_uid);
create index on questions (schedule_id, sort_order) where archived_at is null;
create index on answers (student_id, entry_date);
create index on answers (question_id, entry_date);
create index on point_events (schedule_id, created_at desc);
create index on point_events (student_id);
create index on point_events (group_id);
