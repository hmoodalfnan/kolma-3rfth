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

## Creating the super admin

Create the auth user in **Authentication → Users → Add user**:

- Email: `mohammed@qawafel.internal`
- Password: your choice, at least 8 characters with two character classes
- Tick **Auto Confirm User**

Then run in the SQL editor:

```sql
insert into app_users (id, username, display_name, role)
select id, 'mohammed', 'محمد', 'super_admin'
from auth.users where email = 'mohammed@qawafel.internal';
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
