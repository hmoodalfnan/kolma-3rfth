-- Remove the "المهام السريعة" tier (daily_tasks / daily_completions).
--
-- البنود اليومية (the rich questions engine) is a strict superset of the simple
-- daily-task checklist — same daily-reset checkable items, but with sections,
-- input types, per-weekday scheduling, and richer scoring. The two were
-- redundant, so we keep البنود and drop the simple tier entirely.
--
-- Order matters: the leaderboard's user_points view sums daily_completions, so
-- redefine it first (assignments + answers only), THEN drop the tables. Their RLS
-- policies, indexes, and the completion-guard trigger drop with them via cascade.
--
-- Destructive: this deletes all daily_tasks rows and their completions. Run it
-- only once the simple-task data is no longer needed.

create or replace view user_points
with (security_invoker = on) as
select
  s.id as user_id,
  coalesce(
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

drop table if exists daily_completions cascade;
drop table if exists daily_tasks cascade;
drop function if exists daily_completions_guard() cascade;
