-- Deeds tracker: leaderboard views.
-- security_invoker = on is essential; without it a view runs as its owner and
-- silently bypasses every RLS policy.

create or replace view v_student_totals
with (security_invoker = on) as
select
  s.id                  as student_id,
  s.schedule_id,
  s.group_id,
  s.full_name,
  g.name                as group_name,
  sc.name               as schedule_name,
  sc.status             as schedule_status,
  coalesce(a.points, 0) as answer_points,
  coalesce(p.points, 0) as grant_points,
  coalesce(a.points, 0) + coalesce(p.points, 0) as total_points,
  coalesce(a.completed_items, 0) as completed_items
from students s
join schedules sc on sc.id = s.schedule_id
left join groups g on g.id = s.group_id
left join lateral (
  select sum(points) as points, count(*) filter (where points > 0) as completed_items
  from answers where student_id = s.id
) a on true
left join lateral (
  select sum(points) as points from point_events where student_id = s.id
) p on true
where s.is_active;

create or replace view v_group_totals
with (security_invoker = on) as
select
  g.id            as group_id,
  g.schedule_id,
  g.name          as group_name,
  count(vs.student_id)              as member_count,
  coalesce(sum(vs.total_points), 0) as member_points,
  coalesce(gp.points, 0)            as group_points,
  coalesce(sum(vs.total_points), 0) + coalesce(gp.points, 0) as total_points,
  case when count(vs.student_id) = 0 then 0
       else round(coalesce(sum(vs.total_points), 0) / count(vs.student_id), 1)
  end as avg_points
from groups g
left join v_student_totals vs on vs.group_id = g.id
left join lateral (
  select sum(points) as points from point_events where group_id = g.id
) gp on true
group by g.id, g.schedule_id, g.name, gp.points;

create or replace view v_question_totals
with (security_invoker = on) as
select
  a.student_id,
  a.question_id,
  q.schedule_id,
  q.title as question_title,
  count(*) filter (where a.points > 0) as times_completed,
  sum(a.points)                        as points
from answers a
join questions q on q.id = a.question_id
group by a.student_id, a.question_id, q.schedule_id, q.title;
