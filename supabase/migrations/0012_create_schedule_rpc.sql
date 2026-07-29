-- Deeds tracker: let a manager create a schedule and reach it afterwards.
--
-- Creating a trip as a manager failed with:
--
--   new row violates row-level security policy for table "schedules"
--
-- The INSERT permission was never the problem. The client inserts with a
-- RETURNING clause, and PostgreSQL evaluates a table's SELECT policies as a
-- with-check option whenever an INSERT returns rows — a denial there raises the
-- same message as a failed WITH CHECK, which is what made this look like a
-- permissions bug on INSERT.
--
-- schedules_read grants access through is_staff_of(id), which looks for a
-- schedule_staff row. A manager creating a brand new schedule cannot have one:
-- the schedule did not exist a moment ago. So they were denied reading back the
-- row they had just created. Super admins were unaffected because is_staff_of
-- short-circuits on is_super_admin().
--
-- Linking the creator afterwards cannot fix it. RLS with-check options are
-- evaluated before the tuple is written, so an AFTER trigger runs too late, and
-- a BEFORE trigger cannot insert the schedule_staff row because its foreign key
-- has nothing to point at yet.
--
-- So creation moves into one SECURITY DEFINER function: it authorises
-- explicitly, inserts the schedule, makes the creator staff of it, and seeds the
-- default criteria — all in one transaction, with no RLS round trip in between.
-- This follows grant_group_points and grant_student_points in 0007.
--
-- Safe to re-run.

create or replace function create_schedule(
  p_name                     text,
  p_slug                     text,
  p_start_date               date,
  p_end_date                 date     default null,
  p_streak_threshold_pct     int      default 100,
  p_backfill_days            int      default 3,
  p_students_see_leaderboard boolean  default true
) returns schedules
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  created schedules;
  actor   uuid := auth.uid();
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation has to be explicit.
  if app_role() not in ('super_admin', 'manager') then
    raise exception 'غير مصرح لك بإنشاء رحلة';
  end if;

  insert into schedules (
    name, slug, start_date, end_date,
    streak_threshold_pct, backfill_days, students_see_leaderboard, created_by
  )
  values (
    p_name, p_slug, p_start_date, p_end_date,
    coalesce(p_streak_threshold_pct, 100),
    coalesce(p_backfill_days, 3),
    coalesce(p_students_see_leaderboard, true),
    actor
  )
  returning * into created;

  -- Without this the creator cannot read, let alone manage, what they just
  -- made. Super admins reach every schedule regardless, but the row costs
  -- nothing and keeps "who runs this trip" honest.
  insert into schedule_staff (schedule_id, user_id)
  values (created.id, actor)
  on conflict (schedule_id, user_id) do nothing;

  perform seed_default_criteria(created.id);

  return created;
end $$;

grant execute on function create_schedule(text, text, date, date, int, int, boolean) to authenticated;

-- Repair any schedule that already lost its owner this way: a trip whose
-- creator is a manager with no staff row cannot be managed by anyone but a
-- super admin.
insert into schedule_staff (schedule_id, user_id)
select s.id, s.created_by
from schedules s
join app_users u on u.id = s.created_by and u.role = 'manager'
where s.created_by is not null
on conflict (schedule_id, user_id) do nothing;
