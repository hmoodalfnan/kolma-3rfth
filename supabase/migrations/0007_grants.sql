-- Qawafel: transactional group point grants.

create or replace function grant_group_points(
  p_schedule uuid, p_group uuid, p_criterion uuid,
  p_points numeric, p_note text, p_apply_to_members boolean
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare parent_id uuid;
begin
  -- SECURITY DEFINER bypasses RLS, so the authorization check must be explicit.
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  if not exists (select 1 from groups where id = p_group and schedule_id = p_schedule) then
    raise exception 'المجموعة غير موجودة في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, group_id, criterion_id, points, note, applied_to_members, created_by)
  values
    (p_schedule, p_group, p_criterion, p_points, coalesce(p_note, ''), p_apply_to_members, auth.uid())
  returning id into parent_id;

  if p_apply_to_members then
    insert into point_events
      (schedule_id, student_id, criterion_id, points, note, parent_event_id, created_by)
    select p_schedule, s.id, p_criterion, p_points, coalesce(p_note, ''), parent_id, auth.uid()
    from students s
    where s.group_id = p_group and s.is_active;
  end if;

  return parent_id;
end $$;

create or replace function grant_student_points(
  p_schedule uuid, p_student uuid, p_criterion uuid, p_points numeric, p_note text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare event_id uuid;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  if not exists (select 1 from students where id = p_student and schedule_id = p_schedule) then
    raise exception 'الطالب غير موجود في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events (schedule_id, student_id, criterion_id, points, note, created_by)
  values (p_schedule, p_student, p_criterion, p_points, coalesce(p_note, ''), auth.uid())
  returning id into event_id;

  return event_id;
end $$;
