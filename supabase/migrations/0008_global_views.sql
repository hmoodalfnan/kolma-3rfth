-- Deeds tracker: cross-schedule views for the super-admin board.

-- Normalize an Arabic name so the same person in several schedules aggregates:
-- strip diacritics and tatweel, unify alef/yeh/teh-marbuta forms, collapse spaces.
create or replace function normalize_ar_name(p_name text) returns text
language sql immutable
set search_path = pg_catalog, public
as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(coalesce(p_name, ''), '[ـً-ْٰ]', '', 'g'),
      'أإآٱىةؤئ',
      'اااايهوي'
    ),
    '\s+', ' ', 'g'));
$$;

create or replace view v_global_student_totals
with (security_invoker = on) as
select
  vs.*,
  normalize_ar_name(vs.full_name) as normalized_name,
  sc.start_date,
  sc.end_date
from v_student_totals vs
join schedules sc on sc.id = vs.schedule_id;

-- Date-bounded point sums, used when the global board applies a date range.
create or replace function student_points_between(
  p_student uuid, p_from date, p_to date
) returns numeric
language sql stable
set search_path = pg_catalog, public
as $$
  select
    coalesce((select sum(points) from answers
              where student_id = p_student
                and (p_from is null or entry_date >= p_from)
                and (p_to   is null or entry_date <= p_to)), 0)
  + coalesce((select sum(points) from point_events
              where student_id = p_student
                and (p_from is null or created_at::date >= p_from)
                and (p_to   is null or created_at::date <= p_to)), 0);
$$;
