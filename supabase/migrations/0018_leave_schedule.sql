-- Deeds tracker: let the person who created a trip walk away from it.
--
-- 0014 forbade removing the trip's owner outright, so that a manager added to
-- someone else's trip could not remove the person accountable for it. That rule
-- is right about other people and wrong about yourself: the owner of a finished
-- trip had no way to put it down, and asking a super admin to detach you from
-- your own trip is not a decision anybody else should have to make.
--
-- Leaving is therefore its own operation, distinct from removing a colleague,
-- and it answers the question the old rule was protecting: who is accountable
-- afterwards.
--
--   * Somebody else is on the trip → ownership moves to the longest-standing of
--     them, and the trip carries on. Nothing about it changes for the students.
--   * Nobody is left → the trip is archived. An unowned live trip is one that
--     students keep filling in and nobody reads; archived, it stays completely
--     readable and stops accepting answers, which is what "finished" means here.
--
-- Archiving is what makes this safe to allow. A trip is never left live with no
-- staff on it.
--
-- Safe to re-run.

create or replace function leave_schedule(p_schedule uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor      uuid := auth.uid();
  owner_id   uuid;
  successor  uuid;
  new_owner  text;
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must be explicit.
  if actor is null then
    raise exception 'انتهت جلستك. سجّل الدخول من جديد ثم حاول مرة أخرى';
  end if;

  if not exists (
    select 1 from schedule_staff where schedule_id = p_schedule and user_id = actor
  ) then
    raise exception 'أنت لست من مشرفي هذه الرحلة';
  end if;

  select created_by into owner_id from schedules where id = p_schedule;

  delete from schedule_staff where schedule_id = p_schedule and user_id = actor;

  -- Only the owner leaving raises the question of who is accountable next.
  if actor is distinct from owner_id then
    return jsonb_build_object('outcome', 'left');
  end if;

  -- Longest-standing remaining manager: whoever has been on the trip the
  -- longest is the one most likely to know what it is.
  select ss.user_id, u.display_name
    into successor, new_owner
  from schedule_staff ss
  join app_users u on u.id = ss.user_id and u.is_active
  where ss.schedule_id = p_schedule
  order by ss.created_at, ss.user_id
  limit 1;

  if successor is not null then
    update schedules set created_by = successor where id = p_schedule;
    return jsonb_build_object('outcome', 'transferred', 'owner_name', new_owner);
  end if;

  update schedules
     set status      = 'archived',
         archived_at = coalesce(archived_at, now()),
         created_by  = null
   where id = p_schedule;

  return jsonb_build_object('outcome', 'archived');
end $$;

grant execute on function leave_schedule(uuid) to authenticated;
