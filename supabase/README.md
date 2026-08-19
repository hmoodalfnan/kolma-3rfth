# Database setup

Run the migrations **in order** in **Supabase Dashboard → SQL Editor → New query**.
Paste one file, press Run, wait for `Success`, then move to the next. Run every file from
`0001_schema.sql` through `0025_admin_mgmt.sql`.

The current model is a **single program, self-registration, task-based** tracker. The
redesign migrations are:

- `0021_program_and_profiles.sql` — seeds the one program, adds `emoji`/`email` to profiles,
  and installs `handle_new_user` (auto-creates a profile when someone signs up), plus
  `app_program()` and `is_admin()` helpers.
- `0022_tasks.sql` — `daily_tasks` + `assignments` (read/listen) + their completion tables,
  with a same-day guard on daily completions.
- `0023_points_leaderboard.sql` — `user_points`, `get_leaderboard()` (emoji + points only;
  `user_id` returned to admins for the name-reveal), and `get_user_name()` (admin only).
- `0024_rls.sql` — RLS for the task tables and closes the old leaderboard name leak (a user
  can now read only their own profile row; names flow only through the admin-gated function).
- `0025_admin_mgmt.sql` — `provision_admin()` for the admin-creates-admin route.

Earlier migrations (`0001`–`0020`) build the original schema; the questions/grading tables
they create are left dormant under default-deny RLS — nothing in the current UI reads them.

## Auth settings

**Authentication → Providers → Email:**

- **Enable** "Allow new users to sign up" — users self-register.
- **Enable Confirm email** — everyone signs in with a real, verified email.
- Minimum password length `8` (the app also enforces this).

**Authentication → URL Configuration:** set the **Site URL** to your production domain and add
`https://YOUR-DOMAIN/login` and `http://localhost:3000/login` to **Redirect URLs** (sign-up
confirmation returns to `/login`).

For real email delivery beyond testing, configure **custom SMTP** under **Authentication →
Emails** — the built-in sender is rate-limited.

## Keeping people signed in

**Authentication → Sessions:** leave "Time-box user sessions" and "Inactivity timeout" unset,
so the refresh token does not expire; the app refreshes the access token when the tab becomes
visible again.

## Creating the first admin

Self-registration only makes normal users. Seed the first admin by hand:

1. **Authentication → Users → Add user** — your email + a password, tick **Auto Confirm User**.
2. Run in the SQL editor (replace the email):

   ```sql
   insert into app_users (id, username, display_name, role)
   select id, 'admin', 'المشرف العام', 'super_admin'
   from auth.users where email = 'you@example.com'
   on conflict (id) do update set role = 'super_admin', is_active = true;

   insert into students (auth_uid, schedule_id, full_name, emoji, email,
                         must_change_password, is_active)
   select id, app_program(), 'المشرف العام', '🛡️', email, false, true
   from auth.users where email = 'you@example.com'
   on conflict (auth_uid) do nothing;
   ```

Sign in at `/login` with that email + password. Any further admins are created from the
**المشرفون** screen in the app.

## Running the database tests

Integration tests verify RLS, scoring parity, rate limiting, and the audit log. They are
skipped unless credentials are present. Add to `.env.local`:

```
SUPABASE_TEST_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_TEST_ANON_KEY=YOUR-ANON-KEY
SUPABASE_TEST_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
```

Then:

```bash
npm test -- tests/db
```

They create and delete throwaway rows, so run them against a project you are happy to write to.
