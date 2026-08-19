-- ==================== 0021_program_and_profiles.sql ====================

-- Redesign 1/5: single program, self-serve profiles, emoji identity.
--
-- The multi-trip machinery is retired at the UI level; here we (a) guarantee a
-- single program row, (b) give the students table the emoji/email it now needs,
-- and (c) auto-create a profile whenever someone self-registers via Supabase Auth.

-- 1. The one and only program. Idempotent.
insert into schedules (name, slug, start_date, timezone, status, students_see_leaderboard)
values ('كلّما عرفته', 'kollamaarafto', current_date, 'Asia/Riyadh', 'active', true)
on conflict (slug) do nothing;

-- Returns the single program's id. SECURITY DEFINER so it works before a caller
-- has any row that RLS would let them read (e.g. inside handle_new_user).
create or replace function app_program() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$ select id from schedules where slug = 'kollamaarafto' limit 1 $$;

-- Clear alias for the new two-role world; admin == the old super_admin.
create or replace function is_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$ select is_super_admin() $$;

-- 2. Profile columns for the self-serve model.
alter table students add column if not exists emoji text;
alter table students add column if not exists email text;
alter table students alter column must_change_password set default false;

-- 3. Auto-provision a profile on self-registration.
--    Skipped when the admin route sets admin_provisioned=true (it inserts the
--    profile itself, alongside the app_users row).
create or replace function handle_new_user() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if (new.raw_user_meta_data ? 'full_name')
     and coalesce((new.raw_user_meta_data ->> 'admin_provisioned')::boolean, false) = false
  then
    insert into students (auth_uid, schedule_id, full_name, emoji, email,
                          must_change_password, is_active)
    values (
      new.id,
      app_program(),
      left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
      nullif(new.raw_user_meta_data ->> 'emoji', ''),
      new.email,
      false,
      true
    )
    on conflict (auth_uid) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ==================== 0022_tasks.sql ====================

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


-- ==================== 0023_points_leaderboard.sql ====================

-- Redesign 3/5: points aggregation + the de-identified leaderboard.
--
-- Names are never exposed to non-admins. The leaderboard is served only through
-- get_leaderboard(), which returns emoji + points and includes the resolvable
-- user_id ONLY when the caller is an admin. get_user_name() is the admin-only
-- reveal, gated behind a confirmation dialog in the UI.

-- Per-user totals. security_invoker so direct SELECTs still respect RLS; access
-- is additionally revoked below so only the SECURITY DEFINER functions read it.
create or replace view user_points
with (security_invoker = on) as
select
  s.id as user_id,
  coalesce(
    (select sum(t.points)
       from daily_completions dc
       join daily_tasks t on t.id = dc.task_id
      where dc.user_id = s.id), 0)
  + coalesce(
    (select sum(a.points)
       from assignment_completions ac
       join assignments a on a.id = ac.assignment_id
      where ac.user_id = s.id), 0) as points
from students s
where s.is_active;

revoke all on user_points from anon, authenticated;

-- The leaderboard. Ordered by points desc, ties broken by seniority.
create or replace function get_leaderboard()
returns table (rank bigint, emoji text, points numeric, user_id uuid)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    row_number() over (order by p.points desc, s.created_at asc) as rank,
    coalesce(nullif(s.emoji, ''), '🙂') as emoji,
    p.points,
    case when is_admin() then s.id else null end as user_id
  from students s
  join user_points p on p.user_id = s.id
  where s.is_active
  order by rank;
$$;

-- Admin-only name reveal for a single leaderboard row.
create or replace function get_user_name(p_user uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select case when is_admin()
              then (select full_name from students where id = p_user)
              else null end;
$$;

grant execute on function get_leaderboard() to authenticated;
grant execute on function get_user_name(uuid) to authenticated;


-- ==================== 0024_rls.sql ====================

-- Redesign 4/5: RLS for the task tables + closing the leaderboard name leak.

alter table daily_tasks             enable row level security;
alter table daily_completions       enable row level security;
alter table assignments             enable row level security;
alter table assignment_completions  enable row level security;

alter table daily_tasks             force row level security;
alter table daily_completions       force row level security;
alter table assignments             force row level security;
alter table assignment_completions  force row level security;

-- daily_tasks: users see active tasks; admins manage everything.
create policy daily_tasks_read on daily_tasks for select to authenticated
  using (is_admin() or (is_active and archived_at is null));
create policy daily_tasks_write on daily_tasks for all to authenticated
  using (is_admin()) with check (is_admin());

-- assignments: same shape.
create policy assignments_read on assignments for select to authenticated
  using (is_admin() or (is_active and archived_at is null));
create policy assignments_write on assignments for all to authenticated
  using (is_admin()) with check (is_admin());

-- daily_completions: a user reads/writes only their own; admins see all.
create policy daily_completions_read on daily_completions for select to authenticated
  using (is_admin() or user_id = app_student_id());
create policy daily_completions_insert on daily_completions for insert to authenticated
  with check (
    is_admin()
    or (user_id = app_student_id()
        and exists (select 1 from daily_tasks t
                    where t.id = task_id and t.is_active and t.archived_at is null))
  );
create policy daily_completions_delete on daily_completions for delete to authenticated
  using (is_admin() or user_id = app_student_id());

-- assignment_completions: a user reads/writes only their own; admins see all.
create policy assignment_completions_read on assignment_completions for select to authenticated
  using (is_admin() or user_id = app_student_id());
create policy assignment_completions_insert on assignment_completions for insert to authenticated
  with check (
    is_admin()
    or (user_id = app_student_id()
        and exists (select 1 from assignments a
                    where a.id = assignment_id and a.is_active and a.archived_at is null))
  );
create policy assignment_completions_delete on assignment_completions for delete to authenticated
  using (is_admin() or user_id = app_student_id());

-- Tighten students: the old policy let schedule-mates read each other's rows for
-- the leaderboard, which exposed names. Names now flow only through the
-- admin-gated get_user_name(); a user may read just their own row.
drop policy if exists students_read on students;
drop policy if exists students_staff_write on students;

create policy students_read on students for select to authenticated
  using (is_admin() or auth_uid = auth.uid());
create policy students_admin_write on students for all to authenticated
  using (is_admin()) with check (is_admin());
-- students_self_update (from 0003) remains: a user may edit their own row (emoji).


-- ==================== 0025_admin_mgmt.sql ====================

-- Redesign 5/5: let an admin promote a freshly-created auth user into a full
-- admin (app_users super_admin) AND a normal profile, so every admin is also a
-- user (emoji, tasks, leaderboard). The auth user itself is created by the
-- service-role route; this function does the two table inserts atomically and
-- re-checks authorization in the database.
create or replace function provision_admin(
  p_user    uuid,
  p_display text,
  p_emoji   text,
  p_email   text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_username text;
begin
  if not is_admin() then
    raise exception 'غير مصرح';
  end if;

  -- Username is vestigial now that login is by email, but the column is NOT NULL
  -- and unique — derive a valid, collision-resistant one from the email.
  v_username := lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9_]', '_', 'g'));
  if length(v_username) < 3 then
    v_username := 'adm_' || v_username;
  end if;
  v_username := left(v_username, 24) || '_' || substr(md5(random()::text), 1, 4);

  insert into app_users (id, username, display_name, role, created_by)
  values (p_user, v_username, left(p_display, 120), 'super_admin', auth.uid())
  on conflict (id) do update set role = 'super_admin', is_active = true;

  insert into students (auth_uid, schedule_id, full_name, emoji, email,
                        must_change_password, is_active)
  values (p_user, app_program(), left(p_display, 120), nullif(p_emoji, ''),
          p_email, false, true)
  on conflict (auth_uid) do nothing;
end $$;

grant execute on function provision_admin(uuid, text, text, text) to authenticated;


