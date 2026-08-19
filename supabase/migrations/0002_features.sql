-- ==================== 0009_webauthn.sql ====================

-- Deeds tracker: passkey / biometric sign-in for staff.
--
-- Staff keep their password; a passkey is an additional, faster factor bound to
-- the device's biometric sensor. Students are deliberately excluded: they share
-- devices and pick their name from a list, so a device-bound credential would
-- attach to the wrong person.

create table webauthn_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  credential_id  text not null unique,
  public_key     text not null,
  counter        bigint not null default 0,
  transports     text[],
  device_label   text not null default '',
  backed_up      boolean not null default false,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index on webauthn_credentials (user_id);

alter table webauthn_credentials enable row level security;
alter table webauthn_credentials force row level security;

-- A user may see and delete their own passkeys; a super admin may see and revoke
-- anyone's. Nobody may INSERT or UPDATE through PostgREST — registration goes
-- through the route handler, which verifies the attestation first.
create policy webauthn_read on webauthn_credentials for select to authenticated
  using (user_id = auth.uid() or is_super_admin());

create policy webauthn_delete on webauthn_credentials for delete to authenticated
  using (user_id = auth.uid() or is_super_admin());

revoke insert, update on webauthn_credentials from authenticated, anon;

-- Short-lived challenges. A challenge is single-use: verify deletes it, so a
-- captured assertion cannot be replayed.
create table webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('register', 'login')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

create index on webauthn_challenges (expires_at);

alter table webauthn_challenges enable row level security;
alter table webauthn_challenges force row level security;
-- No policies at all: reachable only by the service role inside route handlers.

create or replace function webauthn_take_challenge(p_id uuid, p_kind text)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare found_challenge text;
begin
  delete from webauthn_challenges
  where id = p_id and kind = p_kind and expires_at > now()
  returning challenge into found_challenge;

  -- Opportunistic cleanup so the table cannot grow without bound.
  delete from webauthn_challenges where expires_at < now() - interval '1 hour';

  return found_challenge;
end $$;


-- ==================== 0010_fix_rls_recursion.sql ====================

-- Deeds tracker: break the infinite recursion in the students RLS policy.
--
-- The original students_read policy sub-selected `students` from inside a policy
-- ON `students`, so evaluating it required evaluating itself. PostgreSQL detects
-- the loop and aborts with:
--
--   infinite recursion detected in policy for relation "students"
--
-- The failure was not confined to student reads: schedules_read, groups_read,
-- questions_read, point_events_read and answers_staff_all all sub-select
-- `students`, and a sub-select inside a policy is itself subject to that table's
-- RLS. So every one of them inherited the recursion, which is why creating a
-- schedule reported a students error.
--
-- The fix is to resolve "who is this student and what may they see" in
-- SECURITY DEFINER functions. Those run as the function owner, bypass RLS, and
-- therefore cannot recurse. Each rewritten policy expresses exactly the same
-- access rule as before, but as an indexed equality rather than a correlated
-- join, so it is also markedly faster on large schedules.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- The schedule the calling student belongs to, or null for staff.
create or replace function app_student_schedule_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.schedule_id
  from students s
  where s.auth_uid = auth.uid() and s.is_active
  limit 1;
$$;

-- The group (room) the calling student belongs to, or null.
create or replace function app_student_group_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.group_id
  from students s
  where s.auth_uid = auth.uid() and s.is_active
  limit 1;
$$;

-- Whether the calling student's schedule exposes the leaderboard. Students may
-- only read their schedule-mates' rows when this is on.
create or replace function app_student_sees_board() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select sc.students_see_leaderboard
    from students s
    join schedules sc on sc.id = s.schedule_id
    where s.auth_uid = auth.uid() and s.is_active
    limit 1
  ), false);
$$;

-- The schedule that owns an arbitrary student row. Used by policies on other
-- tables that need to reach through a student_id without tripping students RLS.
create or replace function app_schedule_of_student(p_student uuid) returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.schedule_id from students s where s.id = p_student;
$$;

grant execute on function app_student_schedule_id()          to authenticated;
grant execute on function app_student_group_id()             to authenticated;
grant execute on function app_student_sees_board()           to authenticated;
grant execute on function app_schedule_of_student(uuid)      to authenticated;

-- ---------------------------------------------------------------------------
-- students — the recursive policy itself
-- ---------------------------------------------------------------------------

drop policy if exists students_read on students;
create policy students_read on students for select to authenticated
  using (
    is_staff_of(schedule_id)
    or auth_uid = auth.uid()
    or (schedule_id = app_student_schedule_id() and app_student_sees_board())
  );

-- ---------------------------------------------------------------------------
-- Tables whose policies reached into students
-- ---------------------------------------------------------------------------

drop policy if exists schedules_read on schedules;
create policy schedules_read on schedules for select to authenticated
  using (
    is_staff_of(id)
    or id = app_student_schedule_id()
  );

drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated
  using (
    is_staff_of(schedule_id)
    or schedule_id = app_student_schedule_id()
  );

drop policy if exists questions_read on questions;
create policy questions_read on questions for select to authenticated
  using (
    is_staff_of(schedule_id)
    or schedule_id = app_student_schedule_id()
  );

drop policy if exists point_events_read on point_events;
create policy point_events_read on point_events for select to authenticated
  using (
    is_staff_of(schedule_id)
    or student_id = app_student_id()
    or (group_id is not null and group_id = app_student_group_id())
  );

drop policy if exists answers_staff_all on answers;
create policy answers_staff_all on answers for all to authenticated
  using (is_staff_of(app_schedule_of_student(answers.student_id)))
  with check (is_staff_of(app_schedule_of_student(answers.student_id)));


-- ==================== 0011_staff_must_change_password.sql ====================

-- Deeds tracker: force a password change after a generated temporary password.
--
-- Supervisor passwords are now generated by the server and handed over out of
-- band (copied into a message), so the person who created the account has seen
-- it. The account is unsafe until its owner replaces it, and this flag is what
-- holds them at /change-password until they do.
--
-- `students` already carries the same column for temporary PINs; this brings
-- staff accounts in line with it.
--
-- Safe to re-run.

alter table app_users
  add column if not exists must_change_password boolean not null default false;


-- ==================== 0012_create_schedule_rpc.sql ====================

-- Deeds tracker: let a manager create a schedule and reach it afterwards.
--
-- Creating a trip as a manager failed with:
--
--   new row violates row-level security policy for table "schedules"
--
-- The INSERT permission was never the problem. The client inserts with a
-- RETURNING clause, and PostgreSQL evaluates a table's SELECT policies as a
-- with-check option whenever an INSERT returns rows — a denial there raises the
-- same message as a failed WITH CHECK, which is what made this look like a
-- permissions bug on INSERT.
--
-- schedules_read grants access through is_staff_of(id), which looks for a
-- schedule_staff row. A manager creating a brand new schedule cannot have one:
-- the schedule did not exist a moment ago. So they were denied reading back the
-- row they had just created. Super admins were unaffected because is_staff_of
-- short-circuits on is_super_admin().
--
-- Linking the creator afterwards cannot fix it. RLS with-check options are
-- evaluated before the tuple is written, so an AFTER trigger runs too late, and
-- a BEFORE trigger cannot insert the schedule_staff row because its foreign key
-- has nothing to point at yet.
--
-- So creation moves into one SECURITY DEFINER function: it authorises
-- explicitly, inserts the schedule, makes the creator staff of it, and seeds the
-- default criteria — all in one transaction, with no RLS round trip in between.
-- This follows grant_group_points and grant_student_points in 0007.
--
-- Safe to re-run.

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
  created schedules;
  actor   uuid := auth.uid();
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation has to be explicit.
  if app_role() not in ('super_admin', 'manager') then
    raise exception 'غير مصرح لك بإنشاء رحلة';
  end if;

  insert into schedules (
    name, slug, start_date, end_date,
    streak_threshold_pct, backfill_days, students_see_leaderboard, created_by
  )
  values (
    p_name, p_slug, p_start_date, p_end_date,
    coalesce(p_streak_threshold_pct, 100),
    coalesce(p_backfill_days, 3),
    coalesce(p_students_see_leaderboard, true),
    actor
  )
  returning * into created;

  -- Without this the creator cannot read, let alone manage, what they just
  -- made. Super admins reach every schedule regardless, but the row costs
  -- nothing and keeps "who runs this trip" honest.
  insert into schedule_staff (schedule_id, user_id)
  values (created.id, actor)
  on conflict (schedule_id, user_id) do nothing;

  perform seed_default_criteria(created.id);

  return created;
end $$;

grant execute on function create_schedule(text, text, date, date, int, int, boolean) to authenticated;

-- Repair any schedule that already lost its owner this way: a trip whose
-- creator is a manager with no staff row cannot be managed by anyone but a
-- super admin.
insert into schedule_staff (schedule_id, user_id)
select s.id, s.created_by
from schedules s
join app_users u on u.id = s.created_by and u.role = 'manager'
where s.created_by is not null
on conflict (schedule_id, user_id) do nothing;


-- ==================== 0013_question_titles.sql ====================

-- Deeds tracker: drop the rak'ah count from the sunnah titles.
--
-- "سنة الظهر القبلية (4 ركعات)" carried a detail nobody was checking a box
-- about — the box means "I prayed it", and the count only made the label longer
-- on a phone. The seed no longer produces them; this repairs the rows already
-- created from it, including the copies inside live trips.
--
-- Matches a trailing parenthesis containing ركعة or ركعات in any form, so a
-- title someone typed by hand is cleaned up the same way. Titles without one are
-- left untouched.
--
-- Safe to re-run.

update question_library
set title = btrim(regexp_replace(title, '\s*\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$', ''))
where title ~ '\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$';

update questions
set title = btrim(regexp_replace(title, '\s*\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$', ''))
where title ~ '\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$';


-- ==================== 0014_schedule_staff_assignment.sql ====================

-- Deeds tracker: let managers run the staffing of their own trips.
--
-- Until now only a super admin could touch schedule_staff, so adding a
-- colleague to a trip — or stepping off one yourself — meant asking someone
-- else. Managers now do both, with one line they cannot cross: the trip's owner
-- (schedules.created_by) can only be removed by a super admin. Otherwise two
-- managers could remove each other, or one could remove the person who created
-- the trip and leave it with nobody accountable for it.
--
-- The writes go through SECURITY DEFINER functions rather than a relaxed policy,
-- because the owner rule is conditional on the row being written and on who is
-- asking — awkward to express as a policy and easy to read as a function.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Reads: staff need to see who else is on the trip, and who they could add
-- ---------------------------------------------------------------------------

-- Previously a manager could only see their own schedule_staff rows, so the
-- staff list of their own trip appeared to contain only them.
drop policy if exists schedule_staff_read on schedule_staff;
create policy schedule_staff_read on schedule_staff for select to authenticated
  using (
    user_id = auth.uid()
    or is_super_admin()
    or is_staff_of(schedule_id)
  );

-- And a manager could only read their own app_users row, so there was nobody to
-- pick from. Staff may now see other staff: display name, username, role. This
-- exposes nothing a colleague would not already know, and students are still
-- excluded from the table entirely.
drop policy if exists app_users_self_read on app_users;
create policy app_users_self_read on app_users for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or app_role() = 'manager'
  );

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create or replace function assign_schedule_staff(p_schedule uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must be explicit.
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح لك بتعديل مشرفي هذه الرحلة';
  end if;

  if not exists (
    select 1 from app_users
    where id = p_user and is_active and role in ('manager', 'super_admin')
  ) then
    raise exception 'الحساب غير موجود أو غير مفعّل';
  end if;

  insert into schedule_staff (schedule_id, user_id)
  values (p_schedule, p_user)
  on conflict (schedule_id, user_id) do nothing;
end $$;

create or replace function unassign_schedule_staff(p_schedule uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare owner_id uuid;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح لك بتعديل مشرفي هذه الرحلة';
  end if;

  select created_by into owner_id from schedules where id = p_schedule;

  -- The owner stays unless a super admin says otherwise. Without this, a manager
  -- added to a trip could remove the person whose trip it is.
  if p_user = owner_id and not is_super_admin() then
    raise exception 'لا يمكن إزالة منشئ الرحلة — راجع المشرف العام';
  end if;

  delete from schedule_staff
  where schedule_id = p_schedule and user_id = p_user;
end $$;

grant execute on function assign_schedule_staff(uuid, uuid)   to authenticated;
grant execute on function unassign_schedule_staff(uuid, uuid) to authenticated;


-- ==================== 0015_manager_trip_control.sql ====================

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


-- ==================== 0016_question_sections.sql ====================

-- Deeds tracker: tidy the seeded section names.
--
-- "قيام وضحى" grouped two deeds that stand on their own, and the heading was
-- doing no work: الوتر and الضحى read fine ungrouped. Clearing the section is
-- enough — groupBySection files anything without one under "عام".
--
-- "الأذكار" becomes "أذكار الصباح والمساء", which is what its contents actually
-- are, and matches how they are referred to out loud.
--
-- Both the library and the copies already inside live trips are updated, so a
-- running trip does not keep the old headings.
--
-- Safe to re-run.

update question_library set section = '' where section = 'قيام وضحى';
update questions        set section = '' where section = 'قيام وضحى';

update question_library set section = 'أذكار الصباح والمساء' where section = 'الأذكار';
update questions        set section = 'أذكار الصباح والمساء' where section = 'الأذكار';


-- ==================== 0017_question_review_queue.sql ====================

-- Deeds tracker: surface بنود that managers invent, without taking their trip
-- out of their hands.
--
-- A manager who writes a genuinely good بند has no way to offer it to anyone
-- else, and the super admin has no way to notice it. This flags an original بند
-- created by a manager as pending review. Accepting copies it into the shared
-- library; dismissing only clears the flag. Neither touches the manager's trip —
-- students may already have answered it, and a review is an editorial judgement
-- about the library, not a veto over somebody's trip.
--
-- Only originals qualify. A بند copied from the library carries library_id, so
-- editing it is a local change to one trip and never reaches this queue: that
-- is exactly the "edits stay local" rule.
--
-- Safe to re-run.

alter table questions
  add column if not exists review_state text not null default 'none'
  check (review_state in ('none', 'pending', 'accepted', 'dismissed'));

alter table questions
  add column if not exists created_by uuid references app_users(id) on delete set null;

create index if not exists questions_pending_review
  on questions (review_state) where review_state = 'pending';

-- Set on insert rather than trusted from the client: the browser knows the
-- caller's role, but it is not the authority on it.
create or replace function questions_tag_review() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());

  if new.library_id is null and app_role() = 'manager' then
    new.review_state := 'pending';
  end if;

  return new;
end $$;

drop trigger if exists questions_review_tag on questions;
create trigger questions_review_tag
  before insert on questions
  for each row execute function questions_tag_review();

-- Copy a suggested بند into the shared library. Runs as the definer because
-- question_library is super-admin-only for writes, so the check below is the
-- whole authorisation.
create or replace function accept_suggested_question(p_question uuid)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  q         questions;
  new_id    uuid;
  next_sort int;
begin
  if not is_super_admin() then
    raise exception 'غير مصرح — هذا الإجراء للمشرف العام فقط';
  end if;

  select * into q from questions where id = p_question;
  if q.id is null then
    raise exception 'البند غير موجود';
  end if;

  if exists (select 1 from question_library where lower(btrim(title)) = lower(btrim(q.title))) then
    raise exception 'يوجد بند بهذا العنوان في المكتبة بالفعل';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_sort from question_library;

  insert into question_library (section, title, help_text, type, config, points, sort_order)
  values (q.section, q.title, q.help_text, q.type, q.config, q.points, next_sort)
  returning id into new_id;

  -- The trip keeps its own copy untouched; this only records that the
  -- suggestion was dealt with.
  update questions set review_state = 'accepted' where id = p_question;

  return new_id;
end $$;

create or replace function dismiss_suggested_question(p_question uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not is_super_admin() then
    raise exception 'غير مصرح — هذا الإجراء للمشرف العام فقط';
  end if;

  -- Deliberately does not delete anything: the بند stays in the trip that
  -- created it, answers and all.
  update questions set review_state = 'dismissed' where id = p_question;
end $$;

grant execute on function accept_suggested_question(uuid)  to authenticated;
grant execute on function dismiss_suggested_question(uuid) to authenticated;


-- ==================== 0018_leave_schedule.sql ====================

-- Deeds tracker: let the person who created a trip walk away from it.
--
-- 0014 forbade removing the trip's owner outright, so that a manager added to
-- someone else's trip could not remove the person accountable for it. That rule
-- is right about other people and wrong about yourself: the owner of a finished
-- trip had no way to put it down, and asking a super admin to detach you from
-- your own trip is not a decision anybody else should have to make.
--
-- Leaving is therefore its own operation, distinct from removing a colleague,
-- and it answers the question the old rule was protecting: who is accountable
-- afterwards.
--
--   * Somebody else is on the trip → ownership moves to the longest-standing of
--     them, and the trip carries on. Nothing about it changes for the students.
--   * Nobody is left → the trip is archived. An unowned live trip is one that
--     students keep filling in and nobody reads; archived, it stays completely
--     readable and stops accepting answers, which is what "finished" means here.
--
-- Archiving is what makes this safe to allow. A trip is never left live with no
-- staff on it.
--
-- Safe to re-run.

create or replace function leave_schedule(p_schedule uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor      uuid := auth.uid();
  owner_id   uuid;
  successor  uuid;
  new_owner  text;
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must be explicit.
  if actor is null then
    raise exception 'انتهت جلستك. سجّل الدخول من جديد ثم حاول مرة أخرى';
  end if;

  if not exists (
    select 1 from schedule_staff where schedule_id = p_schedule and user_id = actor
  ) then
    raise exception 'أنت لست من مشرفي هذه الرحلة';
  end if;

  select created_by into owner_id from schedules where id = p_schedule;

  delete from schedule_staff where schedule_id = p_schedule and user_id = actor;

  -- Only the owner leaving raises the question of who is accountable next.
  if actor is distinct from owner_id then
    return jsonb_build_object('outcome', 'left');
  end if;

  -- Longest-standing remaining manager: whoever has been on the trip the
  -- longest is the one most likely to know what it is.
  select ss.user_id, u.display_name
    into successor, new_owner
  from schedule_staff ss
  join app_users u on u.id = ss.user_id and u.is_active
  where ss.schedule_id = p_schedule
  order by ss.created_at, ss.user_id
  limit 1;

  if successor is not null then
    update schedules set created_by = successor where id = p_schedule;
    return jsonb_build_object('outcome', 'transferred', 'owner_name', new_owner);
  end if;

  update schedules
     set status      = 'archived',
         archived_at = coalesce(archived_at, now()),
         created_by  = null
   where id = p_schedule;

  return jsonb_build_object('outcome', 'archived');
end $$;

grant execute on function leave_schedule(uuid) to authenticated;


-- ==================== 0019_grant_entry_date.sql ====================

-- Deeds tracker: award and deduct points *for a day*, not just at a moment.
--
-- A grant carried only created_at, so the day it belonged to was the day it was
-- typed in. Supervisors do not work that way: the tidying-up happens in the
-- evening, the note about Tuesday gets entered on Wednesday, and a whole
-- morning's grants entered after midnight silently landed on the wrong date.
-- The student's own screen shows the grants for the day being viewed, so those
-- points appeared on a day the student had nothing to do with.
--
-- entry_date is the day the points are *about*. created_at stays exactly what
-- it was — when the row was written — because the audit trail should not move
-- when someone backdates something.
--
-- Safe to re-run.

alter table point_events
  add column if not exists entry_date date;

-- Existing rows keep the day they were entered on, read in the trip's own
-- timezone rather than UTC: a grant written at 01:00 Riyadh belongs to that
-- day, and in UTC it would move to the one before.
update point_events pe
   set entry_date = ((pe.created_at at time zone s.timezone)::date)
  from schedules s
 where s.id = pe.schedule_id
   and pe.entry_date is null;

alter table point_events
  alter column entry_date set default (now() at time zone 'Asia/Riyadh')::date;

-- Backfilled above, so the column can carry its own weight from here.
alter table point_events
  alter column entry_date set not null;

-- The student's day view filters on exactly this.
create index if not exists point_events_student_day
  on point_events (student_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- The grant RPCs take the day
-- ---------------------------------------------------------------------------

-- Both gained a parameter with a default, so an older client that does not send
-- one still works and gets today.

create or replace function grant_student_points(
  p_schedule uuid, p_student uuid, p_criterion uuid, p_points numeric, p_note text,
  p_entry_date date default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  event_id uuid;
  sch      schedules%rowtype;
  day      date;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  select * into sch from schedules where id = p_schedule;

  day := coalesce(p_entry_date, (now() at time zone sch.timezone)::date);

  -- A grant outside the trip cannot be shown to anybody: the student's day
  -- strip only covers the trip's own days, so the points would exist and be
  -- unreachable.
  if day < sch.start_date then
    raise exception 'التاريخ قبل بداية الرحلة';
  end if;
  if sch.end_date is not null and day > sch.end_date then
    raise exception 'التاريخ بعد نهاية الرحلة';
  end if;
  if day > (now() at time zone sch.timezone)::date then
    raise exception 'لا يمكن تسجيل نقاط في يوم لم يأتِ بعد';
  end if;

  if not exists (select 1 from students where id = p_student and schedule_id = p_schedule) then
    raise exception 'الطالب غير موجود في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, student_id, criterion_id, points, note, entry_date, created_by)
  values
    (p_schedule, p_student, p_criterion, p_points, coalesce(p_note, ''), day, auth.uid())
  returning id into event_id;

  return event_id;
end $$;

create or replace function grant_group_points(
  p_schedule uuid, p_group uuid, p_criterion uuid,
  p_points numeric, p_note text, p_apply_to_members boolean,
  p_entry_date date default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  parent_id uuid;
  sch       schedules%rowtype;
  day       date;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  select * into sch from schedules where id = p_schedule;

  day := coalesce(p_entry_date, (now() at time zone sch.timezone)::date);

  if day < sch.start_date then
    raise exception 'التاريخ قبل بداية الرحلة';
  end if;
  if sch.end_date is not null and day > sch.end_date then
    raise exception 'التاريخ بعد نهاية الرحلة';
  end if;
  if day > (now() at time zone sch.timezone)::date then
    raise exception 'لا يمكن تسجيل نقاط في يوم لم يأتِ بعد';
  end if;

  if not exists (select 1 from groups where id = p_group and schedule_id = p_schedule) then
    raise exception 'المجموعة غير موجودة في هذه الرحلة';
  end if;

  if not exists (select 1 from criteria where id = p_criterion and schedule_id = p_schedule) then
    raise exception 'بند التقييم غير موجود في هذه الرحلة';
  end if;

  insert into point_events
    (schedule_id, group_id, criterion_id, points, note, applied_to_members, entry_date, created_by)
  values
    (p_schedule, p_group, p_criterion, p_points, coalesce(p_note, ''), p_apply_to_members, day,
     auth.uid())
  returning id into parent_id;

  -- Members inherit the parent's day, so a backdated group award reaches every
  -- student on the day it was meant for rather than on the day it was typed.
  if p_apply_to_members then
    insert into point_events
      (schedule_id, student_id, criterion_id, points, note, entry_date, parent_event_id, created_by)
    select p_schedule, s.id, p_criterion, p_points, coalesce(p_note, ''), day, parent_id, auth.uid()
    from students s
    where s.group_id = p_group and s.is_active;
  end if;

  return parent_id;
end $$;

grant execute on function grant_student_points(uuid, uuid, uuid, numeric, text, date)
  to authenticated;
grant execute on function grant_group_points(uuid, uuid, uuid, numeric, text, boolean, date)
  to authenticated;


-- ==================== 0020_blur_leaderboard_names.sql ====================

-- Deeds tracker: let a trip screen student names on the leaderboard.
--
-- A manager may want to show the board to the room — projected on a wall, or
-- passed around — without every student's name on display beside their rank.
-- This adds a per-trip switch that blurs every name on the manager leaderboard,
-- the group breakdowns, and the name in the student-detail popup.
--
-- It is a visual screen for showing the board, not a security control: the switch
-- lives in trip settings, is shared by everyone who runs the trip, and flips all
-- names on or off at once. There is deliberately no per-viewer reveal toggle —
-- turning the setting off is how you reveal the names.
--
-- Safe to re-run.

alter table schedules
  add column if not exists blur_leaderboard_names boolean not null default false;


