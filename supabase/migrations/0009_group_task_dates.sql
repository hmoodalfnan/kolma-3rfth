-- Date-pin مهام المجموعة (assignments) and fold them into the streak.
--
-- Until now an assignment was dateless: done once, it carried over every day and
-- its points were a bonus. The redesign gives every assignment a task_date (the
-- day it belongs to, defaulting to "today" in the program timezone). It shows on
-- that day; if the day passes without completion the student is told how many
-- days late they are, but can still tick it — the points always count.
--
-- The streak now requires that each counted day's assignments were done ON TIME
-- (completed on or before their task_date). A late completion still earns points
-- (user_points is unchanged) but breaks the streak for that day.

-- 1) The date column. Backfill existing rows from their creation day, then make
--    it required with a program-timezone "today" default.
alter table assignments add column if not exists task_date date;

update assignments
   set task_date = coalesce(
     (created_at at time zone 'Asia/Riyadh')::date,
     (now()        at time zone 'Asia/Riyadh')::date)
 where task_date is null;

alter table assignments alter column task_date set not null;
alter table assignments alter column task_date set default (now() at time zone 'Asia/Riyadh')::date;

create index if not exists idx_assignments_schedule_task_date
  on assignments (schedule_id, task_date) where archived_at is null;

-- 2) Rebuild the server-side streak (mirrors lib/points/streak.js) so it also
--    demands each day's assignments were completed on time. A day counts when:
--      • its daily questions reach the threshold (as before), AND
--      • every active assignment dated that day was completed on or before it.
--    Days with neither questions nor assignments are skipped, not broken.
create or replace function app_user_streak(p_user uuid)
returns int language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  sch          record;
  d            date;
  threshold    numeric;
  possible     numeric;
  earned       numeric;
  active_total int;
  group_total  int;
  group_ontime int;
  streak       int := 0;
begin
  select * into sch from schedules where id = app_program();
  if not found then return 0; end if;
  threshold := coalesce(sch.streak_threshold_pct, 100);

  d := (now() at time zone 'Asia/Riyadh')::date;
  if sch.end_date is not null and d > sch.end_date then d := sch.end_date; end if;

  while d >= sch.start_date loop
    -- Daily questions active on d, and their max attainable points.
    select count(*),
           coalesce(sum(question_max_points(q.type::text, q.config, q.points)), 0)
      into active_total, possible
      from questions q
     where q.schedule_id = sch.id
       and q.archived_at is null
       and (q.active_from is null or q.active_from <= d)
       and (q.active_to   is null or q.active_to   >= d)
       and (q.active_weekdays is null or extract(dow from d)::int = any(q.active_weekdays));

    -- Assignments dated d, and how many this user finished on time.
    select count(*),
           count(*) filter (
             where ac.user_id is not null
               and (ac.completed_at at time zone 'Asia/Riyadh')::date <= d)
      into group_total, group_ontime
      from assignments a
      left join assignment_completions ac
             on ac.assignment_id = a.id and ac.user_id = p_user
     where a.schedule_id = sch.id
       and a.is_active
       and a.archived_at is null
       and a.task_date = d;

    if active_total = 0 and group_total = 0 then
      d := d - 1;              -- nothing scheduled: neither counts nor breaks
      continue;
    end if;

    if active_total > 0 then
      exit when possible <= 0; -- questions exist but none scoreable: day incomplete
      select coalesce(sum(a.points), 0) into earned
        from answers a
       where a.student_id = p_user and a.entry_date = d;
      exit when (earned / possible) * 100 + 1e-9 < threshold;
    end if;

    exit when group_total > 0 and group_ontime < group_total;

    streak := streak + 1;
    d := d - 1;
  end loop;

  return streak;
end;
$$;
