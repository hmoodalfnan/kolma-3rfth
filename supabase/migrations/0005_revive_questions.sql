-- Revive the rich "questions" (بنود) engine alongside the simple task model.
--
-- The questions/answers tables, their server-side scoring trigger (app_score_answer
-- + answers_score), the active-window trigger, and RLS all already exist from
-- 0001/0002 and work as-is in the single-program model:
--   * app_role() returns 'student' for self-registered users, so the window trigger
--     keeps them from back/future-dating answers.
--   * is_staff_of(schedule_id) is true for super_admins, so admins manage questions.
--   * students read their program's questions and read/write only their own answers.
--
-- The one missing link is scoring: the leaderboard's user_points view summed only
-- daily_completions + assignment_completions. Fold in each student's answer points
-- so the rich بنود count toward the leaderboard exactly like the two task tiers.

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
      where ac.user_id = s.id), 0)
  + coalesce(
    (select sum(ans.points)
       from answers ans
      where ans.student_id = s.id), 0) as points
from students s
where s.is_active;

-- security_invoker view: only the SECURITY DEFINER leaderboard functions read it.
revoke all on user_points from anon, authenticated;
