-- Counter (عداد) target: the count that earns 100% of a counter's points.
--
-- A counter now distinguishes two ceilings: `target` (the count worth full points
-- — the question's 100%) and `max` (the hard cap it can reach). Units beyond the
-- target and up to max keep scoring as bonus ABOVE that question's 100%. So the
-- max attainable "100%" is target·points_per_unit, while a student can still earn
-- more raw points (which is why the streak/completion caps each question's
-- contribution at its own 100% — an over-target counter must not paper over other
-- unfinished بنود). `target` defaults to `max` when unset, so existing counters
-- are unchanged. Per-answer points (app_score_answer) are untouched: bonus units
-- up to max still count toward the leaderboard.

-- 1) 100% for one question — counter uses target (falling back to max).
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
    when 'counter'       then greatest(0, coalesce((p_config->>'target')::numeric, (p_config->>'max')::numeric, 0)
                                          * coalesce((p_config->>'points_per_unit')::numeric, 0))
    when 'rating'        then greatest(0, coalesce((p_config->>'max')::numeric, 0)
                                          * coalesce((p_config->>'points_per_star')::numeric, 0))
    else 0
  end;
$$;

-- Keep the original app_max_points (0001) mirrored for consistency (currently
-- unused, but it must not disagree about a counter's 100%).
create or replace function app_max_points(
  q_type   question_type_t,
  q_config jsonb,
  q_points numeric
) returns numeric
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare best numeric := 0;
begin
  case q_type
    when 'bool' then
      best := greatest(0, coalesce(q_points, 0));

    when 'per_prayer' then
      best := greatest(0,
        jsonb_array_length(
          coalesce(q_config -> 'prayers', '["fajr","dhuhr","asr","maghrib","isha"]'::jsonb))
        * coalesce((q_config ->> 'points_per_prayer')::numeric, 1));

    when 'single_choice' then
      select greatest(0, coalesce(max((o ->> 'points')::numeric), 0)) into best
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o;

    when 'multi_choice' then
      select coalesce(sum(greatest(0, (o ->> 'points')::numeric)), 0) into best
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o;

    when 'counter' then
      best := greatest(0, coalesce((q_config ->> 'target')::numeric, (q_config ->> 'max')::numeric, 0)
                        * coalesce((q_config ->> 'points_per_unit')::numeric, 1));

    when 'rating' then
      best := greatest(0, coalesce((q_config ->> 'max')::numeric, 5)
                        * coalesce((q_config ->> 'points_per_star')::numeric, 1));

    else
      best := 0;
  end case;

  return coalesce(best, 0);
end $$;

-- 2) Rebuild the streak so a day's earned is each answer capped at its own 100%
--    (mirrors lib/points/score.js completionPct). Without the cap, an over-target
--    counter could push the day past the threshold while other بنود are unfinished.
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
  group_total  int;
  group_ontime int;
  streak       int := 0;
begin
  select * into sch from schedules where id = app_program();
  if not found then return 0; end if;
  threshold := coalesce(sch.streak_threshold_pct, 100);

  d := (now() at time zone 'Asia/Riyadh')::date;
  if sch.end_date is not null and d > sch.end_date then d := sch.end_date; end if;

  while d >= sch.start_date loop
    -- Daily questions active on d, and their max attainable (100%) points.
    select count(*),
           coalesce(sum(question_max_points(q.type::text, q.config, q.points)), 0)
      into active_total, possible
      from questions q
     where q.schedule_id = sch.id
       and q.archived_at is null
       and (q.active_from is null or q.active_from <= d)
       and (q.active_to   is null or q.active_to   >= d)
       and (q.active_weekdays is null or extract(dow from d)::int = any(q.active_weekdays));

    -- Assignments dated d, and how many this user finished on time.
    select count(*),
           count(*) filter (
             where ac.user_id is not null
               and (ac.completed_at at time zone 'Asia/Riyadh')::date <= d)
      into group_total, group_ontime
      from assignments a
      left join assignment_completions ac
             on ac.assignment_id = a.id and ac.user_id = p_user
     where a.schedule_id = sch.id
       and a.is_active
       and a.archived_at is null
       and a.task_date = d;

    if active_total = 0 and group_total = 0 then
      d := d - 1;              -- nothing scheduled: neither counts nor breaks
      continue;
    end if;

    if active_total > 0 then
      exit when possible <= 0; -- questions exist but none scoreable: day incomplete
      -- Cap each answer at its question's 100% so bonus cannot mask other بنود.
      select coalesce(sum(least(a.points,
               question_max_points(q.type::text, q.config, q.points))), 0)
        into earned
        from answers a
        join questions q on q.id = a.question_id
       where a.student_id = p_user and a.entry_date = d;
      exit when (earned / possible) * 100 + 1e-9 < threshold;
    end if;

    exit when group_total > 0 and group_ontime < group_total;

    streak := streak + 1;
    d := d - 1;
  end loop;

  return streak;
end;
$$;
