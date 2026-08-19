# Database setup

Run the migrations **in order** in **Supabase Dashboard → SQL Editor → New query**.
Paste one file, press Run, wait for `Success`, then move to the next. There are three:

1. `0001_base.sql` — schema, scoring/identity functions, RLS, rate-limit + audit log, seed,
   leaderboard views, transactional grants.
2. `0002_features.sql` — passkey/biometric tables, an RLS-recursion fix, and incremental
   platform features.
3. `0003_redesign.sql` — the current **single-program, self-registration, task-based** model:
   seeds the one program; adds `emoji`/`email` to profiles; installs `handle_new_user`
   (auto-creates a profile on sign-up) plus `app_program()`/`is_admin()`; creates
   `daily_tasks` + `assignments` (read/listen) + completions with a same-day guard; the
   de-identified `get_leaderboard()` (emoji + points; `user_id` only to admins) and
   admin-only `get_user_name()`; RLS for the task tables (and closes the old leaderboard name
   leak); and `provision_admin()` for the admin-creates-admin route.

(These were consolidated from 25 numbered migrations — identical end state. The
questions/grading tables built in `0001`/`0002` are left dormant under default-deny RLS;
nothing in the current UI reads them.)

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
