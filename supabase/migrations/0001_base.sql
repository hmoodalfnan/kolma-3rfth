-- ==================== 0001_schema.sql ====================

-- Deeds tracker: core schema
create extension if not exists pgcrypto;

create type app_role_t        as enum ('super_admin', 'manager');
create type schedule_status_t as enum ('active', 'archived');
create type question_type_t   as enum
  ('bool', 'per_prayer', 'single_choice', 'multi_choice', 'counter', 'rating', 'text');

-- Staff identities. id matches auth.users.id.
create table app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  role         app_role_t not null,
  is_active    boolean not null default true,
  created_by   uuid references app_users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table schedules (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 160),
  slug                     text not null unique check (slug ~ '^[0-9a-z]{10,32}$'),
  start_date               date not null,
  end_date                 date,                       -- NULL = open-ended
  timezone                 text not null default 'Asia/Riyadh',
  status                   schedule_status_t not null default 'active',
  streak_threshold_pct     int  not null default 100 check (streak_threshold_pct between 1 and 100),
  backfill_days            int  not null default 3   check (backfill_days between 0 and 365),
  students_see_leaderboard boolean not null default true,
  created_by               uuid references app_users(id) on delete set null,
  created_at               timestamptz not null default now(),
  archived_at              timestamptz,
  constraint schedules_dates_ordered check (end_date is null or end_date >= start_date)
);

-- Many-to-many: a manager may run several schedules; a schedule may have several managers.
create table schedule_staff (
  schedule_id uuid not null references schedules(id) on delete cascade,
  user_id     uuid not null references app_users(id) on delete cascade,
  group_scope uuid[],                                  -- NULL = whole schedule
  created_at  timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

create table groups (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  sort_order  int  not null default 0,
  join_slug   text unique check (join_slug is null or join_slug ~ '^[0-9a-z]{10,32}$'),
  created_at  timestamptz not null default now(),
  unique (schedule_id, name)
);

create table students (
  id                   uuid primary key default gen_random_uuid(),
  schedule_id          uuid not null references schedules(id) on delete cascade,
  group_id             uuid references groups(id) on delete set null,
  auth_uid             uuid unique references auth.users(id) on delete set null,
  full_name            text not null check (length(full_name) between 1 and 120),
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);

-- Super admin's master set. Managers copy from it; copies are independent.
create table question_library (
  id         uuid primary key default gen_random_uuid(),
  section    text not null default '' check (length(section) <= 120),
  title      text not null check (length(title) between 1 and 240),
  help_text  text not null default '' check (length(help_text) <= 500),
  type       question_type_t not null,
  config     jsonb not null default '{}'::jsonb,
  points     numeric(8,2) not null default 0,
  sort_order int not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table questions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references schedules(id) on delete cascade,
  library_id      uuid references question_library(id) on delete set null,
  section         text not null default '' check (length(section) <= 120),
  title           text not null check (length(title) between 1 and 240),
  help_text       text not null default '' check (length(help_text) <= 500),
  type            question_type_t not null,
  config          jsonb not null default '{}'::jsonb,
  points          numeric(8,2) not null default 0,
  active_weekdays int[] check (
                    active_weekdays is null
                    or (array_length(active_weekdays, 1) between 1 and 7
                        and active_weekdays <@ array[0,1,2,3,4,5,6])
                  ),
  active_from     date,
  active_to       date,
  is_required     boolean not null default false,
  sort_order      int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint questions_active_range
    check (active_to is null or active_from is null or active_to >= active_from)
);

create table answers (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(id) on delete cascade,
  question_id       uuid not null references questions(id) on delete cascade,
  entry_date        date not null,
  value             jsonb not null,
  points            numeric(8,2) not null default 0,
  client_updated_at timestamptz not null default now(),
  device_id         text check (device_id is null or length(device_id) <= 64),
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  unique (student_id, question_id, entry_date)
);

create table criteria (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references schedules(id) on delete cascade,
  name           text not null check (length(name) between 1 and 120),
  allow_negative boolean not null default true,
  sort_order     int not null default 0,
  archived_at    timestamptz,
  unique (schedule_id, name)
);

create table point_events (
  id                 uuid primary key default gen_random_uuid(),
  schedule_id        uuid not null references schedules(id) on delete cascade,
  student_id         uuid references students(id) on delete cascade,
  group_id           uuid references groups(id) on delete cascade,
  criterion_id       uuid not null references criteria(id) on delete restrict,
  points             numeric(8,2) not null check (points <> 0),
  note               text not null default '' check (length(note) <= 500),
  applied_to_members boolean not null default false,
  parent_event_id    uuid references point_events(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint point_events_one_target check (
    (student_id is not null and group_id is null)
    or (student_id is null and group_id is not null)
  )
);

-- Negative grants are impossible against a criterion that forbids them.
create or replace function point_events_check_sign() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare allowed boolean;
begin
  select allow_negative into allowed from criteria where id = new.criterion_id;
  if allowed is null then
    raise exception 'criterion % not found', new.criterion_id;
  end if;
  if not allowed and new.points < 0 then
    raise exception 'هذا البند لا يسمح بالخصم';
  end if;
  return new;
end $$;

create trigger point_events_sign_guard
  before insert or update on point_events
  for each row execute function point_events_check_sign();

create index on schedule_staff (user_id);
create index on groups (schedule_id, sort_order);
create index on students (schedule_id, is_active);
create index on students (group_id);
create index on students (auth_uid);
create index on questions (schedule_id, sort_order) where archived_at is null;
create index on answers (student_id, entry_date);
create index on answers (question_id, entry_date);
create index on point_events (schedule_id, created_at desc);
create index on point_events (student_id);
create index on point_events (group_id);


-- ==================== 0002_functions.sql ====================

-- Deeds tracker: scoring, identity helpers, and write guards.
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


-- ==================== 0003_rls.sql ====================

-- Deeds tracker: default-deny row level security on every table.

alter table app_users        enable row level security;
alter table schedules        enable row level security;
alter table schedule_staff   enable row level security;
alter table groups           enable row level security;
alter table students         enable row level security;
alter table question_library enable row level security;
alter table questions        enable row level security;
alter table answers          enable row level security;
alter table criteria         enable row level security;
alter table point_events     enable row level security;

alter table app_users        force row level security;
alter table schedules        force row level security;
alter table schedule_staff   force row level security;
alter table groups           force row level security;
alter table students         force row level security;
alter table question_library force row level security;
alter table questions        force row level security;
alter table answers          force row level security;
alter table criteria         force row level security;
alter table point_events     force row level security;

-- app_users: read yourself; super admin reads and writes everyone.
create policy app_users_self_read on app_users for select to authenticated
  using (id = auth.uid() or is_super_admin());
create policy app_users_admin_write on app_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- schedules
create policy schedules_read on schedules for select to authenticated
  using (
    is_staff_of(id)
    or exists (select 1 from students s where s.schedule_id = schedules.id and s.auth_uid = auth.uid())
  );
create policy schedules_insert on schedules for insert to authenticated
  with check (app_role() in ('super_admin', 'manager'));
create policy schedules_update on schedules for update to authenticated
  using (is_staff_of(id)) with check (is_staff_of(id));
create policy schedules_delete on schedules for delete to authenticated
  using (is_super_admin());

-- schedule_staff: only super admin assigns; managers may read their own rows.
create policy schedule_staff_read on schedule_staff for select to authenticated
  using (user_id = auth.uid() or is_super_admin());
create policy schedule_staff_write on schedule_staff for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- groups
create policy groups_read on groups for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = groups.schedule_id and s.auth_uid = auth.uid())
  );
create policy groups_write on groups for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- students: a student reads their own row and their schedule-mates' names
-- (needed for the leaderboard); staff read and write everyone in their schedules.
create policy students_read on students for select to authenticated
  using (
    is_staff_of(schedule_id)
    or auth_uid = auth.uid()
    or exists (
      select 1 from students me
      join schedules sc on sc.id = me.schedule_id
      where me.auth_uid = auth.uid()
        and me.schedule_id = students.schedule_id
        and sc.students_see_leaderboard
    )
  );
create policy students_staff_write on students for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));
create policy students_self_update on students for update to authenticated
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- question_library: everyone on staff reads; only super admin writes.
create policy library_read on question_library for select to authenticated
  using (app_role() in ('super_admin', 'manager'));
create policy library_write on question_library for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- questions
create policy questions_read on questions for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = questions.schedule_id and s.auth_uid = auth.uid())
  );
create policy questions_write on questions for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- answers: a student reads and writes only their own; staff cover their schedules.
create policy answers_student_read on answers for select to authenticated
  using (student_id = app_student_id());
create policy answers_student_insert on answers for insert to authenticated
  with check (student_id = app_student_id());
create policy answers_student_update on answers for update to authenticated
  using (student_id = app_student_id()) with check (student_id = app_student_id());
create policy answers_staff_all on answers for all to authenticated
  using (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)))
  with check (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)));

-- criteria
create policy criteria_read on criteria for select to authenticated
  using (is_staff_of(schedule_id));
create policy criteria_write on criteria for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- point_events: students see grants that touch them; staff manage their schedules.
create policy point_events_read on point_events for select to authenticated
  using (
    is_staff_of(schedule_id)
    or student_id = app_student_id()
    or (group_id is not null
        and exists (select 1 from students s where s.id = app_student_id() and s.group_id = point_events.group_id))
  );
create policy point_events_write on point_events for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));


-- ==================== 0004_rate_limit_audit.sql ====================

-- Deeds tracker: rate limiting, login lockout, and the append-only audit log.

create table rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

alter table rate_limits enable row level security;
alter table rate_limits force row level security;
-- No policies: reachable only through the SECURITY DEFINER function below.

create or replace function rl_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare cur rate_limits%rowtype;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count        = case
                         when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                         then 1 else rate_limits.count + 1 end,
        window_start = case
                         when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                         then now() else rate_limits.window_start end
  returning * into cur;

  return cur.count <= p_limit;
end $$;

create table auth_lockouts (
  identifier   text primary key,
  fail_count   int not null default 0,
  lock_level   int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table auth_lockouts enable row level security;
alter table auth_lockouts force row level security;

create or replace function auth_check_lock(p_identifier text)
returns timestamptz
language sql security definer
set search_path = pg_catalog, public
as $$
  select locked_until from auth_lockouts
  where identifier = p_identifier and locked_until > now();
$$;

-- Five failures lock for 15 minutes; each further round doubles, capped at 24 hours.
create or replace function auth_record_failure(p_identifier text)
returns timestamptz
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  cur       auth_lockouts%rowtype;
  new_level int;
  until     timestamptz;
begin
  insert into auth_lockouts (identifier, fail_count, updated_at)
  values (p_identifier, 1, now())
  on conflict (identifier) do update
    set fail_count = auth_lockouts.fail_count + 1, updated_at = now()
  returning * into cur;

  if cur.fail_count >= 5 then
    new_level := least(cur.lock_level + 1, 7);

    update auth_lockouts
      set fail_count   = 0,
          lock_level   = new_level,
          locked_until = now() + least(
            make_interval(mins => 15) * power(2, new_level - 1),
            make_interval(hours => 24)),
          updated_at   = now()
      where identifier = p_identifier
      returning locked_until into until;

    return until;
  end if;

  return null;
end $$;

create or replace function auth_reset_failures(p_identifier text)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into auth_lockouts (identifier, fail_count, lock_level, locked_until, updated_at)
  values (p_identifier, 0, 0, null, now())
  on conflict (identifier) do update
    set fail_count = 0, lock_level = 0, locked_until = null, updated_at = now();
$$;

create table audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label   text not null default '',
  actor_role    text not null default 'anonymous',
  schedule_id   uuid references schedules(id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index on audit_log (created_at desc);
create index on audit_log (schedule_id, created_at desc);
create index on audit_log (actor_user_id, created_at desc);
create index on audit_log (entity_type, action);

alter table audit_log enable row level security;
alter table audit_log force row level security;

-- Read-only for staff, scoped by schedule. There is deliberately no UPDATE or
-- DELETE policy, so the log cannot be rewritten through PostgREST by anyone.
create policy audit_read on audit_log for select to authenticated
  using (is_super_admin() or (schedule_id is not null and is_staff_of(schedule_id)));

revoke update, delete on audit_log from authenticated, anon, service_role;

create or replace function write_audit(
  p_actor_label text,
  p_actor_role  text,
  p_schedule_id uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_before      jsonb,
  p_after       jsonb,
  p_ip          text,
  p_user_agent  text
) returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into audit_log (
    actor_user_id, actor_label, actor_role, schedule_id,
    entity_type, entity_id, action, before, after, ip, user_agent
  ) values (
    auth.uid(), coalesce(p_actor_label, ''), coalesce(p_actor_role, 'anonymous'), p_schedule_id,
    p_entity_type, p_entity_id, p_action, p_before, p_after,
    nullif(p_ip, '')::inet, left(coalesce(p_user_agent, ''), 400)
  );
$$;


-- ==================== 0005_seed.sql ====================

-- Deeds tracker: master question library seed and default criteria.

insert into question_library (section, title, type, config, points, sort_order) values
  ('السنن الرواتب', 'سنة الفجر',                   'bool', '{}', 5, 1),
  ('السنن الرواتب', 'سنة الظهر القبلية',           'bool', '{}', 5, 2),
  ('السنن الرواتب', 'سنة الظهر البعدية',           'bool', '{}', 5, 3),
  ('السنن الرواتب', 'سنة المغرب',                  'bool', '{}', 5, 4),
  ('السنن الرواتب', 'سنة العشاء',                  'bool', '{}', 5, 5),
  ('',              'صلاة الوتر',                   'bool', '{}', 5, 6),
  ('',              'صلاة الضحى',                   'bool', '{}', 5, 7),
  ('تكبيرة الإحرام', 'تكبيرة الإحرام مع الإمام',   'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 8),
  ('أذكار الصباح والمساء', 'أذكار الصباح',                 'bool', '{}', 5, 9),
  ('أذكار الصباح والمساء', 'أذكار المساء',                 'bool', '{}', 5, 10),
  ('أذكار الصباح والمساء', 'أذكار ما بعد الصلاة',          'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 11),
  ('إضافية',       'الذهاب للمسجد',                'single_choice',
     '{"options":[{"id":"walk","label":"مشياً","points":5},{"id":"ride","label":"بسيارة","points":3},{"id":"none","label":"لم أذهب","points":0}]}',
     0, 12),
  ('إضافية',       'كم صفحة قرأت من القرآن؟',      'counter',
     '{"points_per_unit":1,"max":60,"unit_label":"صفحة"}', 0, 13),
  ('إضافية',       'تقييمك لخشوعك اليوم',          'rating',
     '{"max":5,"points_per_star":1}', 0, 14),
  ('إضافية',       'ملاحظاتك لهذا اليوم',          'text',
     '{"max_length":500}', 0, 15);

-- Applied to every new schedule by the application.
create or replace function seed_default_criteria(p_schedule uuid)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into criteria (schedule_id, name, allow_negative, sort_order) values
    (p_schedule, 'الالتزام بالوقت', true,  1),
    (p_schedule, 'نظافة الغرفة',    true,  2),
    (p_schedule, 'السلوك',          true,  3),
    (p_schedule, 'المبادرة',        false, 4)
  on conflict (schedule_id, name) do nothing;
$$;


-- ==================== 0006_views.sql ====================

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


-- ==================== 0007_grants.sql ====================

-- Deeds tracker: transactional group point grants.

create or replace function grant_group_points(
  p_schedule uuid, p_group uuid, p_criterion uuid,
  p_points numeric, p_note text, p_apply_to_members boolean
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare parent_id uuid;
begin
  -- SECURITY DEFINER bypasses RLS, so the authorization check must be explicit.
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  if not exists (select 1 from groups where id = p_group and schedule_id = p_schedule) then
    raise exception 'المجموعة غير موجودة في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, group_id, criterion_id, points, note, applied_to_members, created_by)
  values
    (p_schedule, p_group, p_criterion, p_points, coalesce(p_note, ''), p_apply_to_members, auth.uid())
  returning id into parent_id;

  if p_apply_to_members then
    insert into point_events
      (schedule_id, student_id, criterion_id, points, note, parent_event_id, created_by)
    select p_schedule, s.id, p_criterion, p_points, coalesce(p_note, ''), parent_id, auth.uid()
    from students s
    where s.group_id = p_group and s.is_active;
  end if;

  return parent_id;
end $$;

create or replace function grant_student_points(
  p_schedule uuid, p_student uuid, p_criterion uuid, p_points numeric, p_note text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare event_id uuid;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  if not exists (select 1 from students where id = p_student and schedule_id = p_schedule) then
    raise exception 'الطالب غير موجود في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events (schedule_id, student_id, criterion_id, points, note, created_by)
  values (p_schedule, p_student, p_criterion, p_points, coalesce(p_note, ''), auth.uid())
  returning id into event_id;

  return event_id;
end $$;


-- ==================== 0008_global_views.sql ====================

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


