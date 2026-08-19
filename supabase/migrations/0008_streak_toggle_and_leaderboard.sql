-- Streak: a global show/hide toggle, and the streak number on the leaderboard.
--
-- The streak was only ever computed client-side (lib/points/streak.js) for the
-- signed-in user. To show it on the de-identified leaderboard it has to be
-- computed server-side, which means mirroring two pieces of the JS scoring in
-- SQL: the max attainable points per question, and the trailing run of complete
-- days. show_streak lets an admin hide the streak everywhere at once.

-- 1) The toggle, on the single program row.
alter table schedules add column if not exists show_streak boolean not null default true;

-- 2) Max attainable points for one question (mirrors lib/points/score.js maxPoints).
create or replace function question_max_points(p_type text, p_config jsonb, p_points numeric)
returns numeric language sql immutable
set search_path = pg_catalog, public
as $$
  select case p_type
    when 'bool'          then greatest(0, coalesce(p_points, 0))
    when 'per_prayer'    then greatest(0, coalesce(jsonb_array_length(p_config->'prayers'), 0)
                                          * coalesce((p_config->>'points_per_prayer')::numeric, 0))
    when 'single_choice' then coalesce((select max((o->>'points')::numeric)
                                          from jsonb_array_elements(coalesce(p_config->'options', '[]'::jsonb)) o), 0)
    when 'multi_choice'  then coalesce((select sum(greatest(0, (o->>'points')::numeric))
                                          from jsonb_array_elements(coalesce(p_config->'options', '[]'::jsonb)) o), 0)
    when 'counter'       then greatest(0, coalesce((p_config->>'max')::numeric, 0)
                                          * coalesce((p_config->>'points_per_unit')::numeric, 0))
    when 'rating'        then greatest(0, coalesce((p_config->>'max')::numeric, 0)
                                          * coalesce((p_config->>'points_per_star')::numeric, 0))
    else 0
  end;
$$;

-- 3) Current completion streak for one student (mirrors lib/points/streak.js).
--    SECURITY DEFINER so it can read every student's answers when the leaderboard
--    computes their streak; not granted to callers, so only get_leaderboard uses it.
create or replace function app_user_streak(p_user uuid)
returns int language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  sch          record;
  d            date;
  threshold    numeric;
  possible     numeric;
  earned       numeric;
  active_total int;
  streak       int := 0;
begin
  select * into sch from schedules where id = app_program();
  if not found then return 0; end if;
  threshold := coalesce(sch.streak_threshold_pct, 100);

  d := (now() at time zone 'Asia/Riyadh')::date;
  if sch.end_date is not null and d > sch.end_date then d := sch.end_date; end if;

  while d >= sch.start_date loop
    select count(*),
           coalesce(sum(question_max_points(q.type::text, q.config, q.points)), 0)
      into active_total, possible
      from questions q
     where q.schedule_id = sch.id
       and q.archived_at is null
       and (q.active_from is null or q.active_from <= d)
       and (q.active_to   is null or q.active_to   >= d)
       and (q.active_weekdays is null or extract(dow from d)::int = any(q.active_weekdays));

    if active_total = 0 then
      d := d - 1;              -- nothing scheduled: neither counts nor breaks
      continue;
    end if;
    exit when possible <= 0;   -- questions exist but none scoreable: day incomplete

    select coalesce(sum(a.points), 0) into earned
      from answers a
     where a.student_id = p_user and a.entry_date = d;

    exit when (earned / possible) * 100 + 1e-9 < threshold;
    streak := streak + 1;
    d := d - 1;
  end loop;

  return streak;
end;
$$;

-- 4) Add the streak column to the leaderboard rows.
drop function if exists get_leaderboard();
create function get_leaderboard()
returns table (rank bigint, emoji text, points numeric, streak int, user_id uuid)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    row_number() over (order by p.points desc, s.created_at asc) as rank,
    coalesce(nullif(s.emoji, ''), '🙂') as emoji,
    p.points,
    app_user_streak(s.id) as streak,
    case when is_admin() then s.id else null end as user_id
  from students s
  join user_points p on p.user_id = s.id
  where s.is_active
  order by rank;
$$;

grant execute on function get_leaderboard() to authenticated;
