-- Deeds tracker: break the infinite recursion in the students RLS policy.
--
-- The original students_read policy sub-selected `students` from inside a policy
-- ON `students`, so evaluating it required evaluating itself. PostgreSQL detects
-- the loop and aborts with:
--
--   infinite recursion detected in policy for relation "students"
--
-- The failure was not confined to student reads: schedules_read, groups_read,
-- questions_read, point_events_read and answers_staff_all all sub-select
-- `students`, and a sub-select inside a policy is itself subject to that table's
-- RLS. So every one of them inherited the recursion, which is why creating a
-- schedule reported a students error.
--
-- The fix is to resolve "who is this student and what may they see" in
-- SECURITY DEFINER functions. Those run as the function owner, bypass RLS, and
-- therefore cannot recurse. Each rewritten policy expresses exactly the same
-- access rule as before, but as an indexed equality rather than a correlated
-- join, so it is also markedly faster on large schedules.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- The schedule the calling student belongs to, or null for staff.
create or replace function app_student_schedule_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.schedule_id
  from students s
  where s.auth_uid = auth.uid() and s.is_active
  limit 1;
$$;

-- The group (room) the calling student belongs to, or null.
create or replace function app_student_group_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.group_id
  from students s
  where s.auth_uid = auth.uid() and s.is_active
  limit 1;
$$;

-- Whether the calling student's schedule exposes the leaderboard. Students may
-- only read their schedule-mates' rows when this is on.
create or replace function app_student_sees_board() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select sc.students_see_leaderboard
    from students s
    join schedules sc on sc.id = s.schedule_id
    where s.auth_uid = auth.uid() and s.is_active
    limit 1
  ), false);
$$;

-- The schedule that owns an arbitrary student row. Used by policies on other
-- tables that need to reach through a student_id without tripping students RLS.
create or replace function app_schedule_of_student(p_student uuid) returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.schedule_id from students s where s.id = p_student;
$$;

grant execute on function app_student_schedule_id()          to authenticated;
grant execute on function app_student_group_id()             to authenticated;
grant execute on function app_student_sees_board()           to authenticated;
grant execute on function app_schedule_of_student(uuid)      to authenticated;

-- ---------------------------------------------------------------------------
-- students — the recursive policy itself
-- ---------------------------------------------------------------------------

drop policy if exists students_read on students;
create policy students_read on students for select to authenticated
  using (
    is_staff_of(schedule_id)
    or auth_uid = auth.uid()
    or (schedule_id = app_student_schedule_id() and app_student_sees_board())
  );

-- ---------------------------------------------------------------------------
-- Tables whose policies reached into students
-- ---------------------------------------------------------------------------

drop policy if exists schedules_read on schedules;
create policy schedules_read on schedules for select to authenticated
  using (
    is_staff_of(id)
    or id = app_student_schedule_id()
  );

drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated
  using (
    is_staff_of(schedule_id)
    or schedule_id = app_student_schedule_id()
  );

drop policy if exists questions_read on questions;
create policy questions_read on questions for select to authenticated
  using (
    is_staff_of(schedule_id)
    or schedule_id = app_student_schedule_id()
  );

drop policy if exists point_events_read on point_events;
create policy point_events_read on point_events for select to authenticated
  using (
    is_staff_of(schedule_id)
    or student_id = app_student_id()
    or (group_id is not null and group_id = app_student_group_id())
  );

drop policy if exists answers_staff_all on answers;
create policy answers_staff_all on answers for all to authenticated
  using (is_staff_of(app_schedule_of_student(answers.student_id)))
  with check (is_staff_of(app_schedule_of_student(answers.student_id)));
