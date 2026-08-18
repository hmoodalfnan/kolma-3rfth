-- Redesign 5/5: let an admin promote a freshly-created auth user into a full
-- admin (app_users super_admin) AND a normal profile, so every admin is also a
-- user (emoji, tasks, leaderboard). The auth user itself is created by the
-- service-role route; this function does the two table inserts atomically and
-- re-checks authorization in the database.
create or replace function provision_admin(
  p_user    uuid,
  p_display text,
  p_emoji   text,
  p_email   text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_username text;
begin
  if not is_admin() then
    raise exception 'غير مصرح';
  end if;

  -- Username is vestigial now that login is by email, but the column is NOT NULL
  -- and unique — derive a valid, collision-resistant one from the email.
  v_username := lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9_]', '_', 'g'));
  if length(v_username) < 3 then
    v_username := 'adm_' || v_username;
  end if;
  v_username := left(v_username, 24) || '_' || substr(md5(random()::text), 1, 4);

  insert into app_users (id, username, display_name, role, created_by)
  values (p_user, v_username, left(p_display, 120), 'super_admin', auth.uid())
  on conflict (id) do update set role = 'super_admin', is_active = true;

  insert into students (auth_uid, schedule_id, full_name, emoji, email,
                        must_change_password, is_active)
  values (p_user, app_program(), left(p_display, 120), nullif(p_emoji, ''),
          p_email, false, true)
  on conflict (auth_uid) do nothing;
end $$;

grant execute on function provision_admin(uuid, text, text, text) to authenticated;
