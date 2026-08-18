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
