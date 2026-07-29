-- Deeds tracker: let managers run the staffing of their own trips.
--
-- Until now only a super admin could touch schedule_staff, so adding a
-- colleague to a trip — or stepping off one yourself — meant asking someone
-- else. Managers now do both, with one line they cannot cross: the trip's owner
-- (schedules.created_by) can only be removed by a super admin. Otherwise two
-- managers could remove each other, or one could remove the person who created
-- the trip and leave it with nobody accountable for it.
--
-- The writes go through SECURITY DEFINER functions rather than a relaxed policy,
-- because the owner rule is conditional on the row being written and on who is
-- asking — awkward to express as a policy and easy to read as a function.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Reads: staff need to see who else is on the trip, and who they could add
-- ---------------------------------------------------------------------------

-- Previously a manager could only see their own schedule_staff rows, so the
-- staff list of their own trip appeared to contain only them.
drop policy if exists schedule_staff_read on schedule_staff;
create policy schedule_staff_read on schedule_staff for select to authenticated
  using (
    user_id = auth.uid()
    or is_super_admin()
    or is_staff_of(schedule_id)
  );

-- And a manager could only read their own app_users row, so there was nobody to
-- pick from. Staff may now see other staff: display name, username, role. This
-- exposes nothing a colleague would not already know, and students are still
-- excluded from the table entirely.
drop policy if exists app_users_self_read on app_users;
create policy app_users_self_read on app_users for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or app_role() = 'manager'
  );

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create or replace function assign_schedule_staff(p_schedule uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must be explicit.
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح لك بتعديل مشرفي هذه الرحلة';
  end if;

  if not exists (
    select 1 from app_users
    where id = p_user and is_active and role in ('manager', 'super_admin')
  ) then
    raise exception 'الحساب غير موجود أو غير مفعّل';
  end if;

  insert into schedule_staff (schedule_id, user_id)
  values (p_schedule, p_user)
  on conflict (schedule_id, user_id) do nothing;
end $$;

create or replace function unassign_schedule_staff(p_schedule uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare owner_id uuid;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح لك بتعديل مشرفي هذه الرحلة';
  end if;

  select created_by into owner_id from schedules where id = p_schedule;

  -- The owner stays unless a super admin says otherwise. Without this, a manager
  -- added to a trip could remove the person whose trip it is.
  if p_user = owner_id and not is_super_admin() then
    raise exception 'لا يمكن إزالة منشئ الرحلة — راجع المشرف العام';
  end if;

  delete from schedule_staff
  where schedule_id = p_schedule and user_id = p_user;
end $$;

grant execute on function assign_schedule_staff(uuid, uuid)   to authenticated;
grant execute on function unassign_schedule_staff(uuid, uuid) to authenticated;
