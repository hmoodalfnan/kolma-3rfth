-- Redesign 1/5: single program, self-serve profiles, emoji identity.
--
-- The multi-trip machinery is retired at the UI level; here we (a) guarantee a
-- single program row, (b) give the students table the emoji/email it now needs,
-- and (c) auto-create a profile whenever someone self-registers via Supabase Auth.

-- 1. The one and only program. Idempotent.
insert into schedules (name, slug, start_date, timezone, status, students_see_leaderboard)
values ('كلّما عرفته', 'kollamaarafto', current_date, 'Asia/Riyadh', 'active', true)
on conflict (slug) do nothing;

-- Returns the single program's id. SECURITY DEFINER so it works before a caller
-- has any row that RLS would let them read (e.g. inside handle_new_user).
create or replace function app_program() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$ select id from schedules where slug = 'kollamaarafto' limit 1 $$;

-- Clear alias for the new two-role world; admin == the old super_admin.
create or replace function is_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$ select is_super_admin() $$;

-- 2. Profile columns for the self-serve model.
alter table students add column if not exists emoji text;
alter table students add column if not exists email text;
alter table students alter column must_change_password set default false;

-- 3. Auto-provision a profile on self-registration.
--    Skipped when the admin route sets admin_provisioned=true (it inserts the
--    profile itself, alongside the app_users row).
create or replace function handle_new_user() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if (new.raw_user_meta_data ? 'full_name')
     and coalesce((new.raw_user_meta_data ->> 'admin_provisioned')::boolean, false) = false
  then
    insert into students (auth_uid, schedule_id, full_name, emoji, email,
                          must_change_password, is_active)
    values (
      new.id,
      app_program(),
      left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
      nullif(new.raw_user_meta_data ->> 'emoji', ''),
      new.email,
      false,
      true
    )
    on conflict (auth_uid) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
