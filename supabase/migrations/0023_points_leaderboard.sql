-- Redesign 3/5: points aggregation + the de-identified leaderboard.
--
-- Names are never exposed to non-admins. The leaderboard is served only through
-- get_leaderboard(), which returns emoji + points and includes the resolvable
-- user_id ONLY when the caller is an admin. get_user_name() is the admin-only
-- reveal, gated behind a confirmation dialog in the UI.

-- Per-user totals. security_invoker so direct SELECTs still respect RLS; access
-- is additionally revoked below so only the SECURITY DEFINER functions read it.
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
      where ac.user_id = s.id), 0) as points
from students s
where s.is_active;

revoke all on user_points from anon, authenticated;

-- The leaderboard. Ordered by points desc, ties broken by seniority.
create or replace function get_leaderboard()
returns table (rank bigint, emoji text, points numeric, user_id uuid)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    row_number() over (order by p.points desc, s.created_at asc) as rank,
    coalesce(nullif(s.emoji, ''), '🙂') as emoji,
    p.points,
    case when is_admin() then s.id else null end as user_id
  from students s
  join user_points p on p.user_id = s.id
  where s.is_active
  order by rank;
$$;

-- Admin-only name reveal for a single leaderboard row.
create or replace function get_user_name(p_user uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select case when is_admin()
              then (select full_name from students where id = p_user)
              else null end;
$$;

grant execute on function get_leaderboard() to authenticated;
grant execute on function get_user_name(uuid) to authenticated;
