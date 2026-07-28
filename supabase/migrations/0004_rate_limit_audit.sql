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
