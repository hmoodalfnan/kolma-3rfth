-- Qawafel: scoring, identity helpers, and write guards.
-- Named app_role() rather than current_role() to avoid the PostgreSQL built-in.

create or replace function app_score_answer(
  q_type   question_type_t,
  q_config jsonb,
  q_points numeric,
  val      jsonb
) returns numeric
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare
  total  numeric := 0;
  prayer text;
  sel    text;
  n      numeric;
  cap    numeric;
begin
  if val is null or jsonb_typeof(val) = 'null' then
    return 0;
  end if;

  case q_type
    when 'bool' then
      if val = 'true'::jsonb then total := coalesce(q_points, 0); end if;

    when 'per_prayer' then
      for prayer in
        select jsonb_array_elements_text(
          coalesce(q_config -> 'prayers', '["fajr","dhuhr","asr","maghrib","isha"]'::jsonb))
      loop
        if val -> prayer = 'true'::jsonb then
          total := total + coalesce((q_config ->> 'points_per_prayer')::numeric, 1);
        end if;
      end loop;

    when 'single_choice' then
      sel := val #>> '{}';
      select coalesce((o ->> 'points')::numeric, 0) into total
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o
      where o ->> 'id' = sel;
      total := coalesce(total, 0);

    when 'multi_choice' then
      if jsonb_typeof(val) = 'array' then
        select coalesce(sum((o ->> 'points')::numeric), 0) into total
        from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o
        where o ->> 'id' in (select distinct jsonb_array_elements_text(val));
      end if;

    when 'counter' then
      if jsonb_typeof(val) = 'number' then
        cap   := coalesce((q_config ->> 'max')::numeric, 0);
        n     := greatest(0, least(cap, trunc((val #>> '{}')::numeric)));
        total := n * coalesce((q_config ->> 'points_per_unit')::numeric, 1);
      end if;

    when 'rating' then
      if jsonb_typeof(val) = 'number' then
        cap   := coalesce((q_config ->> 'max')::numeric, 5);
        n     := greatest(0, least(cap, trunc((val #>> '{}')::numeric)));
        total := n * coalesce((q_config ->> 'points_per_star')::numeric, 1);
      end if;

    else
      total := 0;   -- 'text' and anything unrecognised
  end case;

  return coalesce(total, 0);
end $$;

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
      best := greatest(0, coalesce((q_config ->> 'max')::numeric, 0)
                        * coalesce((q_config ->> 'points_per_unit')::numeric, 1));

    when 'rating' then
      best := greatest(0, coalesce((q_config ->> 'max')::numeric, 5)
                        * coalesce((q_config ->> 'points_per_star')::numeric, 1));

    else
      best := 0;
  end case;

  return coalesce(best, 0);
end $$;

-- Identity helpers. SECURITY DEFINER so RLS on app_users/students cannot recurse.
create or replace function app_role() returns text
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select u.role::text from app_users u where u.id = auth.uid() and u.is_active),
    (select 'student' from students s where s.auth_uid = auth.uid() and s.is_active limit 1)
  );
$$;

create or replace function app_student_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.id from students s where s.auth_uid = auth.uid() and s.is_active limit 1;
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select u.role = 'super_admin' and u.is_active from app_users u where u.id = auth.uid()),
    false);
$$;

create or replace function is_staff_of(p_schedule uuid) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select is_super_admin()
    or exists (
      select 1 from schedule_staff ss
      join app_users u on u.id = ss.user_id and u.is_active
      where ss.schedule_id = p_schedule and ss.user_id = auth.uid()
    );
$$;

-- Recompute points on every write; whatever the client sent is discarded.
create or replace function answers_score() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare q questions%rowtype;
begin
  select * into q from questions where id = new.question_id;
  if not found then
    raise exception 'question % not found', new.question_id;
  end if;

  new.points     := app_score_answer(q.type, q.config, q.points, new.value);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger answers_score_guard
  before insert or update on answers
  for each row execute function answers_score();

-- Students may only write inside the backfill window of a live schedule.
-- Staff corrections are unrestricted and are recorded in the audit log.
create or replace function answers_window() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sch   schedules%rowtype;
  today date;
begin
  if app_role() is distinct from 'student' then
    return new;
  end if;

  select s.* into sch
  from schedules s
  join students st on st.schedule_id = s.id
  where st.id = new.student_id;

  if sch.status = 'archived' then
    raise exception 'الرحلة مؤرشفة ولا يمكن التعديل عليها';
  end if;

  today := (now() at time zone sch.timezone)::date;

  if new.entry_date > least(today, coalesce(sch.end_date, today)) then
    raise exception 'لا يمكن تسجيل يوم في المستقبل';
  end if;

  if new.entry_date < greatest(sch.start_date, today - sch.backfill_days) then
    raise exception 'انتهت مهلة التعديل على هذا اليوم';
  end if;

  return new;
end $$;

create trigger answers_window_guard
  before insert or update on answers
  for each row execute function answers_window();

-- Question config must satisfy the same shape rules the client enforces.
create or replace function questions_validate_config() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare ids text[];
begin
  if new.type in ('single_choice', 'multi_choice') then
    if jsonb_typeof(new.config -> 'options') <> 'array'
       or jsonb_array_length(new.config -> 'options') < 2 then
      raise exception 'يجب إضافة خيارين على الأقل';
    end if;

    select array_agg(o ->> 'id') into ids
    from jsonb_array_elements(new.config -> 'options') o;

    if array_length(ids, 1) <> cardinality(array(select distinct unnest(ids))) then
      raise exception 'معرّف الخيار مكرر';
    end if;

  elsif new.type = 'counter' then
    if coalesce((new.config ->> 'max')::numeric, 0) <= 0 then
      raise exception 'الحد الأقصى للعدّاد يجب أن يكون أكبر من صفر';
    end if;

  elsif new.type = 'rating' then
    if coalesce((new.config ->> 'max')::int, 0) not between 2 and 10 then
      raise exception 'عدد النجوم يجب أن يكون بين 2 و 10';
    end if;
  end if;

  return new;
end $$;

create trigger questions_config_guard
  before insert or update on questions
  for each row execute function questions_validate_config();

create trigger question_library_config_guard
  before insert or update on question_library
  for each row execute function questions_validate_config();
