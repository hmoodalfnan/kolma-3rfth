-- Deeds tracker: award and deduct points *for a day*, not just at a moment.
--
-- A grant carried only created_at, so the day it belonged to was the day it was
-- typed in. Supervisors do not work that way: the tidying-up happens in the
-- evening, the note about Tuesday gets entered on Wednesday, and a whole
-- morning's grants entered after midnight silently landed on the wrong date.
-- The student's own screen shows the grants for the day being viewed, so those
-- points appeared on a day the student had nothing to do with.
--
-- entry_date is the day the points are *about*. created_at stays exactly what
-- it was — when the row was written — because the audit trail should not move
-- when someone backdates something.
--
-- Safe to re-run.

alter table point_events
  add column if not exists entry_date date;

-- Existing rows keep the day they were entered on, read in the trip's own
-- timezone rather than UTC: a grant written at 01:00 Riyadh belongs to that
-- day, and in UTC it would move to the one before.
update point_events pe
   set entry_date = ((pe.created_at at time zone s.timezone)::date)
  from schedules s
 where s.id = pe.schedule_id
   and pe.entry_date is null;

alter table point_events
  alter column entry_date set default (now() at time zone 'Asia/Riyadh')::date;

-- Backfilled above, so the column can carry its own weight from here.
alter table point_events
  alter column entry_date set not null;

-- The student's day view filters on exactly this.
create index if not exists point_events_student_day
  on point_events (student_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- The grant RPCs take the day
-- ---------------------------------------------------------------------------

-- Both gained a parameter with a default, so an older client that does not send
-- one still works and gets today.

create or replace function grant_student_points(
  p_schedule uuid, p_student uuid, p_criterion uuid, p_points numeric, p_note text,
  p_entry_date date default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  event_id uuid;
  sch      schedules%rowtype;
  day      date;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  select * into sch from schedules where id = p_schedule;

  day := coalesce(p_entry_date, (now() at time zone sch.timezone)::date);

  -- A grant outside the trip cannot be shown to anybody: the student's day
  -- strip only covers the trip's own days, so the points would exist and be
  -- unreachable.
  if day < sch.start_date then
    raise exception 'التاريخ قبل بداية الرحلة';
  end if;
  if sch.end_date is not null and day > sch.end_date then
    raise exception 'التاريخ بعد نهاية الرحلة';
  end if;
  if day > (now() at time zone sch.timezone)::date then
    raise exception 'لا يمكن تسجيل نقاط في يوم لم يأتِ بعد';
  end if;

  if not exists (select 1 from students where id = p_student and schedule_id = p_schedule) then
    raise exception 'الطالب غير موجود في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, student_id, criterion_id, points, note, entry_date, created_by)
  values
    (p_schedule, p_student, p_criterion, p_points, coalesce(p_note, ''), day, auth.uid())
  returning id into event_id;

  return event_id;
end $$;

create or replace function grant_group_points(
  p_schedule uuid, p_group uuid, p_criterion uuid,
  p_points numeric, p_note text, p_apply_to_members boolean,
  p_entry_date date default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  parent_id uuid;
  sch       schedules%rowtype;
  day       date;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  select * into sch from schedules where id = p_schedule;

  day := coalesce(p_entry_date, (now() at time zone sch.timezone)::date);

  if day < sch.start_date then
    raise exception 'التاريخ قبل بداية الرحلة';
  end if;
  if sch.end_date is not null and day > sch.end_date then
    raise exception 'التاريخ بعد نهاية الرحلة';
  end if;
  if day > (now() at time zone sch.timezone)::date then
    raise exception 'لا يمكن تسجيل نقاط في يوم لم يأتِ بعد';
  end if;

  if not exists (select 1 from groups where id = p_group and schedule_id = p_schedule) then
    raise exception 'المجموعة غير موجودة في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, group_id, criterion_id, points, note, applied_to_members, entry_date, created_by)
  values
    (p_schedule, p_group, p_criterion, p_points, coalesce(p_note, ''), p_apply_to_members, day,
     auth.uid())
  returning id into parent_id;

  -- Members inherit the parent's day, so a backdated group award reaches every
  -- student on the day it was meant for rather than on the day it was typed.
  if p_apply_to_members then
    insert into point_events
      (schedule_id, student_id, criterion_id, points, note, entry_date, parent_event_id, created_by)
    select p_schedule, s.id, p_criterion, p_points, coalesce(p_note, ''), day, parent_id, auth.uid()
    from students s
    where s.group_id = p_group and s.is_active;
  end if;

  return parent_id;
end $$;

grant execute on function grant_student_points(uuid, uuid, uuid, numeric, text, date)
  to authenticated;
grant execute on function grant_group_points(uuid, uuid, uuid, numeric, text, boolean, date)
  to authenticated;
