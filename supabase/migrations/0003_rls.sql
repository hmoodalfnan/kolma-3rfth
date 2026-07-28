-- Deeds tracker: default-deny row level security on every table.

alter table app_users        enable row level security;
alter table schedules        enable row level security;
alter table schedule_staff   enable row level security;
alter table groups           enable row level security;
alter table students         enable row level security;
alter table question_library enable row level security;
alter table questions        enable row level security;
alter table answers          enable row level security;
alter table criteria         enable row level security;
alter table point_events     enable row level security;

alter table app_users        force row level security;
alter table schedules        force row level security;
alter table schedule_staff   force row level security;
alter table groups           force row level security;
alter table students         force row level security;
alter table question_library force row level security;
alter table questions        force row level security;
alter table answers          force row level security;
alter table criteria         force row level security;
alter table point_events     force row level security;

-- app_users: read yourself; super admin reads and writes everyone.
create policy app_users_self_read on app_users for select to authenticated
  using (id = auth.uid() or is_super_admin());
create policy app_users_admin_write on app_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- schedules
create policy schedules_read on schedules for select to authenticated
  using (
    is_staff_of(id)
    or exists (select 1 from students s where s.schedule_id = schedules.id and s.auth_uid = auth.uid())
  );
create policy schedules_insert on schedules for insert to authenticated
  with check (app_role() in ('super_admin', 'manager'));
create policy schedules_update on schedules for update to authenticated
  using (is_staff_of(id)) with check (is_staff_of(id));
create policy schedules_delete on schedules for delete to authenticated
  using (is_super_admin());

-- schedule_staff: only super admin assigns; managers may read their own rows.
create policy schedule_staff_read on schedule_staff for select to authenticated
  using (user_id = auth.uid() or is_super_admin());
create policy schedule_staff_write on schedule_staff for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- groups
create policy groups_read on groups for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = groups.schedule_id and s.auth_uid = auth.uid())
  );
create policy groups_write on groups for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- students: a student reads their own row and their schedule-mates' names
-- (needed for the leaderboard); staff read and write everyone in their schedules.
create policy students_read on students for select to authenticated
  using (
    is_staff_of(schedule_id)
    or auth_uid = auth.uid()
    or exists (
      select 1 from students me
      join schedules sc on sc.id = me.schedule_id
      where me.auth_uid = auth.uid()
        and me.schedule_id = students.schedule_id
        and sc.students_see_leaderboard
    )
  );
create policy students_staff_write on students for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));
create policy students_self_update on students for update to authenticated
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- question_library: everyone on staff reads; only super admin writes.
create policy library_read on question_library for select to authenticated
  using (app_role() in ('super_admin', 'manager'));
create policy library_write on question_library for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- questions
create policy questions_read on questions for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = questions.schedule_id and s.auth_uid = auth.uid())
  );
create policy questions_write on questions for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- answers: a student reads and writes only their own; staff cover their schedules.
create policy answers_student_read on answers for select to authenticated
  using (student_id = app_student_id());
create policy answers_student_insert on answers for insert to authenticated
  with check (student_id = app_student_id());
create policy answers_student_update on answers for update to authenticated
  using (student_id = app_student_id()) with check (student_id = app_student_id());
create policy answers_staff_all on answers for all to authenticated
  using (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)))
  with check (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)));

-- criteria
create policy criteria_read on criteria for select to authenticated
  using (is_staff_of(schedule_id));
create policy criteria_write on criteria for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- point_events: students see grants that touch them; staff manage their schedules.
create policy point_events_read on point_events for select to authenticated
  using (
    is_staff_of(schedule_id)
    or student_id = app_student_id()
    or (group_id is not null
        and exists (select 1 from students s where s.id = app_student_id() and s.group_id = point_events.group_id))
  );
create policy point_events_write on point_events for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));
