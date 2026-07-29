-- Deeds tracker: let managers own the trips they run.
--
-- Three things here.
--
-- 1. create_schedule refused managers with "غير مصرح لك بإنشاء رحلة". It gated on
--    app_role() being one of two enum labels, which fails closed on anything it
--    does not recognise and says nothing about what it actually saw. The real
--    question is simpler and cannot go wrong this way: does the caller have an
--    active staff account? Both roles are meant to create trips. The refusal now
--    reports what it found, so a future failure is diagnosable instead of a
--    guess.
--
-- 2. Trip names must be unique, case- and whitespace-insensitively. Two trips
--    called "تست" are indistinguishable in every dropdown in the app.
--
-- 3. Managers may add colleagues to a trip they run. assign_schedule_staff
--    already allowed this, but a trip created before 0012 has no staff row for
--    anyone, so its manager was locked out of their own trip. The repair below
--    covers trips with no staff at all by handing them to their creator.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Creation
-- ---------------------------------------------------------------------------

create or replace function create_schedule(
  p_name                     text,
  p_slug                     text,
  p_start_date               date,
  p_end_date                 date     default null,
  p_streak_threshold_pct     int      default 100,
  p_backfill_days            int      default 3,
  p_students_see_leaderboard boolean  default true
) returns schedules
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  created  schedules;
  actor    uuid := auth.uid();
  actor_row app_users;
  clean    text := btrim(p_name);
begin
  select * into actor_row from app_users where id = actor;

  -- SECURITY DEFINER bypasses RLS, so authorisation must be explicit. Anything
  -- that refuses says why, because "not authorised" with no detail cost a long
  -- debugging session once already.
  if actor is null then
    raise exception 'انتهت جلستك. سجّل الدخول من جديد ثم حاول مرة أخرى';
  end if;
  if actor_row.id is null then
    raise exception 'لا يوجد حساب مشرف مرتبط بهذا الدخول';
  end if;
  if not actor_row.is_active then
    raise exception 'حسابك معطّل — راجع المشرف العام';
  end if;

  if clean = '' then
    raise exception 'اسم الرحلة مطلوب';
  end if;

  if exists (
    select 1 from schedules where lower(btrim(name)) = lower(clean)
  ) then
    raise exception 'يوجد رحلة بهذا الاسم بالفعل — اختر اسماً مختلفاً';
  end if;

  insert into schedules (
    name, slug, start_date, end_date,
    streak_threshold_pct, backfill_days, students_see_leaderboard, created_by
  )
  values (
    clean, p_slug, p_start_date, p_end_date,
    coalesce(p_streak_threshold_pct, 100),
    coalesce(p_backfill_days, 3),
    coalesce(p_students_see_leaderboard, true),
    actor
  )
  returning * into created;

  -- Without this the creator cannot read, let alone manage, what they just made.
  insert into schedule_staff (schedule_id, user_id)
  values (created.id, actor)
  on conflict (schedule_id, user_id) do nothing;

  perform seed_default_criteria(created.id);

  return created;
end $$;

grant execute on function create_schedule(text, text, date, date, int, int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Unique trip names
-- ---------------------------------------------------------------------------

-- Duplicates already exist — two trips called "تست" — and an index cannot be
-- built over them. Rename the later ones first, keeping the oldest untouched so
-- whoever has been using it sees no change. "تست" and "تست" become "تست" and
-- "تست (2)".
--
-- Looped because a rename can itself collide with a name that already exists
-- ("تست (2)" being taken). Bounded so a pathological set cannot spin forever;
-- five passes is far past anything realistic.
do $$
declare passes int := 0;
begin
  loop
    exit when not exists (
      select 1 from schedules group by lower(btrim(name)) having count(*) > 1
    );

    passes := passes + 1;
    exit when passes > 5;

    with ranked as (
      select id,
             row_number() over (
               partition by lower(btrim(name)) order by created_at, id
             ) as rn
      from schedules
    )
    update schedules s
    set name = btrim(s.name) || ' (' || r.rn || ')'
    from ranked r
    where s.id = r.id and r.rn > 1;
  end loop;

  -- Last resort: a short slice of the id is unique by construction, so the
  -- index below can always be built even if the numbering kept colliding.
  if exists (select 1 from schedules group by lower(btrim(name)) having count(*) > 1) then
    with ranked as (
      select id,
             row_number() over (
               partition by lower(btrim(name)) order by created_at, id
             ) as rn
      from schedules
    )
    update schedules s
    set name = btrim(s.name) || ' (' || substr(replace(s.id::text, '-', ''), 1, 4) || ')'
    from ranked r
    where s.id = r.id and r.rn > 1;
  end if;
end $$;

-- Renames go through a plain UPDATE, so the guard has to live in the database
-- rather than only inside create_schedule.
create unique index if not exists schedules_name_unique
  on schedules (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 3. Repair trips nobody can staff
-- ---------------------------------------------------------------------------

-- A trip created before 0012 has no schedule_staff rows, so only a super admin
-- can reach it and its manager cannot add anyone. Hand each one to its creator.
insert into schedule_staff (schedule_id, user_id)
select s.id, s.created_by
from schedules s
where s.created_by is not null
  and not exists (select 1 from schedule_staff ss where ss.schedule_id = s.id)
on conflict (schedule_id, user_id) do nothing;
