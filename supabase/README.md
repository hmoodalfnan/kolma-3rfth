# Database setup

Run the migrations **in order** in **Supabase Dashboard → SQL Editor → New query**.
Paste one file, press Run, wait for `Success. No rows returned`, then move to the next.

1. `migrations/0001_schema.sql` — tables, enums, indexes
2. `migrations/0002_functions.sql` — scoring engine, identity helpers, write guards
3. `migrations/0003_rls.sql` — row level security policies
4. `migrations/0004_rate_limit_audit.sql` — rate limiting, lockout, audit log
5. `migrations/0005_seed.sql` — starter question library, default criteria
6. `migrations/0006_views.sql` — leaderboard views
7. `migrations/0007_grants.sql` — transactional point grants
8. `migrations/0008_global_views.sql` — cross-schedule views
9. `migrations/0009_webauthn.sql` — passkey / biometric sign-in for staff
10. `migrations/0010_fix_rls_recursion.sql` — fixes `infinite recursion detected in
    policy for relation "students"`
11. `migrations/0011_staff_must_change_password.sql` — forces a password change after
    a generated temporary password
12. `migrations/0012_create_schedule_rpc.sql` — lets a manager create a trip and reach
    it afterwards, and repairs trips whose manager was left without access
13. `migrations/0013_question_titles.sql` — drops the rak'ah count from the sunnah titles
14. `migrations/0014_schedule_staff_assignment.sql` — lets managers staff their own
    trips, with the trip's owner removable only by a super admin

Migrations 9 and 10 are safe to run on a project that is already live, and
migration 10 is safe to re-run. If sign-in reports `Could not find the table
'public.webauthn_credentials'`, migration 9 has not been applied yet.

## If you set up before the rename

The synthetic auth domain changed from `qawafel.internal` to `tracker.internal`.
Accounts created under the old domain still work **only** while the Vercel
environment variable `AUTH_EMAIL_DOMAIN` is still set to `qawafel.internal`.

To finish the rename, set `AUTH_EMAIL_DOMAIN=tracker.internal` in Vercel **and**
run this once:

```sql
update auth.users
set email = replace(email, '@qawafel.internal', '@tracker.internal')
where email like '%@qawafel.internal';
```

Verify nothing was missed:

```sql
select count(*) from auth.users where email like '%@qawafel.internal';
```

Expected: `0`. Do these two things together — changing only one of them locks
everyone out until the other is done.

## Creating the super admin

Create the auth user in **Authentication → Users → Add user**:

- Email: `mohammed@tracker.internal`
- Password: your choice, at least 8 characters with two character classes
- Tick **Auto Confirm User**

Then run in the SQL editor:

```sql
insert into app_users (id, username, display_name, role)
select id, 'mohammed', 'محمد', 'super_admin'
from auth.users where email = 'mohammed@tracker.internal';
```

Verify:

```sql
select username, role, is_active from app_users;
```

Expected: one row — `mohammed | super_admin | t`.

You log in at `/login` with the username `mohammed` (not the email — the email is an
internal detail you never type).

## Auth settings

**Authentication → Sign In / Providers → Email:**

- **Disable** "Allow new users to sign up" — accounts are only created by staff through
  the app.
- Set **Minimum password length** to `6` (students use 6-digit PINs; the app enforces
  8+ for staff separately).
- Turn **Confirm email** off (addresses are synthetic and never receive mail).

**Authentication → URL Configuration:** set the Site URL to your production domain.

## Daily archive job

**Database → Cron → Create job**, schedule `5 21 * * *` (00:05 Riyadh = 21:05 UTC):

```sql
update schedules
set status = 'archived', archived_at = now()
where status = 'active'
  and end_date is not null
  and end_date < (now() at time zone timezone)::date;
```

Schedules with no end date (`end_date is null`) are deliberately never touched — they
run indefinitely until someone archives them by hand.

## Running the database tests

The repository ships integration tests that verify RLS, the scoring parity between
JavaScript and SQL, rate limiting, and the audit log. They are skipped unless
credentials are present. Add to `.env.local`:

```
SUPABASE_TEST_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_TEST_ANON_KEY=YOUR-ANON-KEY
SUPABASE_TEST_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
```

Then:

```bash
npm test -- tests/db
```

They create and delete throwaway rows, so run them against a project you are happy to
write to — ideally before you add real students.
