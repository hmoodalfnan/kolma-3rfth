# كلّما عرفته — Self-Serve, Tasks & Rebrand: Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning
**Supersedes (in part):** `2026-07-28-sunnah-tracker-design.md` — the sections on
multi-schedule "trips", the manager role, join-links, groups/rooms, the
staff-provisioned PIN login, the question/answer/grading subsystem, the navy
palette, and the "never render the logo" rule are all replaced below.

---

## 1. Purpose & summary of change

The app pivots from a **staff-provisioned, multi-trip, question-based tracker** to a
**self-serve, single-program, task-based tracker** with a de-identified leaderboard and a
green brand pulled from the program logo.

What changes at a glance:

1. **Self-registration** with real email + password + **Supabase email verification**.
2. **One program only** — remove trips/schedules management, cloning, join-links, the
   manager role, and groups/rooms.
3. **Two-tier tasks** replace the question/grading system:
   - **Daily tasks** — reset every day.
   - **Persistent assignments** — a **read** item and a **listen** item that stay on the
     user's list across days until marked done once.
4. **Emoji identity** — every account picks an emoji at registration (duplicates allowed).
5. **De-identified leaderboard** — everyone sees emoji + points + rank, never names. Admins
   can reveal a name behind a confirmation dialog.
6. **Users tab (admin)** — names, email, emoji, completion data, **no points column**.
7. **Admins manage admins** — a super admin can create more admins.
8. **Admin is also a user** — an in-account **Admin ⇄ User** view switch.
9. **Green/cream rebrand** from `logo.jpg` / `post.jpg`, and the **logo is now rendered**.

Kept from the original app: security posture (RLS default-deny, DB-computed points,
rate-limiting, audit log, CSP/headers), **WebAuthn biometric login**, and **Excel export**.

This is greenfield: never deployed, no live users/data, so migrations are forward-only and
may reshape freely.

---

## 2. Accounts & roles

Two roles only: **Admin** (super admin) and **User**.

- Every person is one **Supabase Auth user** — real email + password, email-verified.
- Every account has a **profile row** (the repurposed `students` table): `full_name`,
  `emoji`, mirror `email`, timestamps. This includes admins, so **an admin is also a user**
  (has an emoji, does tasks, appears on the leaderboard).
- **Admin status** is a row in `app_users` with `role = 'super_admin'`. A `SECURITY DEFINER`
  helper `is_admin()` drives RLS. The `manager` role is retired (enum value kept, unused).
- **Self-registered users**: profile only, no `app_users` row.
- **Admin-created admins**: server route (service role) creates the auth user, inserts the
  `app_users` super_admin row **and** a profile row.

### 2.1 View switching (Admin ⇄ User)

- Admins see a top-bar toggle. **Admin mode** → admin dashboard; **User mode** → the normal
  user app (today's tasks, leaderboard, settings).
- The toggle is a **client-side UI preference only** (persisted in `localStorage`). All
  server authorization uses the real role from the DB — switching to "User" view never grants
  or removes any privilege; it only changes which screens render.
- Non-admins never see the toggle.

---

## 3. Authentication

### 3.1 Registration (`/register`)

Fields: **name, email, password, emoji**.

- Client calls `supabase.auth.signUp({ email, password, options: { data: { full_name, emoji },
  emailRedirectTo } })`.
- Password policy unchanged from the original spec (≥ 8 chars, ≥ 2 character classes,
  denylist), validated by Zod client-side and re-checked server-side where applicable.
- Emoji is chosen from a curated gallery grid (~40–60 emojis). **Duplicates allowed.**
- Supabase sends a **confirmation email**. Until confirmed, sign-in returns
  `email_not_confirmed`; the login screen shows an Arabic message + a **resend** button
  (`supabase.auth.resend`).
- A DB trigger `handle_new_user()` (AFTER INSERT on `auth.users`) creates the profile row from
  `raw_user_meta_data` (`full_name`, `emoji`), attached to the single program. It skips rows
  that carry an `admin_provisioned` metadata flag (those get their profile from the admin
  route instead, to avoid double insert).

### 3.2 Login (`/login`)

- **One unified email + password screen** for users and admins.
- Login still goes through `POST /api/auth/login` for rate-limiting, lockout, and audit
  (unchanged mechanism), now using the **real email** instead of a synthesized one.
- After sign-in the client resolves role: `app_users` row → admin; otherwise → user, and
  routes accordingly (defaulting admins to Admin view).
- **WebAuthn/passkey** login is kept; a user enrolls a passkey from settings after first login
  and can then sign in biometrically.

### 3.3 Removed auth surface

- Student PIN login, `must_change_password` forced-change flow, temp-PIN sheets, join-links
  (`/j/[slug]`), and per-group login lists are removed. Synthesized `@tracker.internal` emails
  are no longer created.

---

## 4. Single program

- Seed **exactly one** program (one `schedules` row with a fixed, well-known id/slug). A
  `SECURITY DEFINER` helper `app_program()` returns its id; every task/leaderboard query is
  scoped to it.
- Removed from the UI: schedule list/create/edit/clone/archive, join-link management, group
  management, manager assignment, and the manager-facing schedule roster.
- `schedule_id` / `group_id` columns remain on existing tables (harmless FKs) but the program
  is always the single seeded one and groups are unused.

---

## 5. Task subsystem (new core)

### 5.1 Daily tasks

```
daily_tasks(
  id, program_id, title, description, points numeric(8,2),
  is_active bool default true, sort_order int, archived_at, created_at
)
daily_completions(
  id, user_id (-> students.id), task_id (-> daily_tasks.id),
  done_date date, created_at,
  unique (user_id, task_id, done_date)
)
```

- Appear **every day**. A user checks off each task for **today** (backfill window optional,
  default same-day only to keep it simple; can reuse the original backfill idea later).
- Points for a completed daily task = `daily_tasks.points`, **read from the task at
  aggregation time** — never sent by the client.

### 5.2 Persistent assignments (must-do)

```
assignment_kind_t enum ('read', 'listen')
assignments(
  id, program_id, kind assignment_kind_t, title, body_text text,
  points numeric(8,2), is_active bool default true, archived_at, created_at, sort_order
)
assignment_completions(
  id, user_id, assignment_id, completed_at,
  unique (user_id, assignment_id)
)
```

- `body_text` is the typed content: for **read**, the text to read in-app; for **listen**,
  the typed instruction (the actual audio is shared in the WhatsApp community — no in-app
  audio/player/links).
- An active assignment stays on the user's list **across days until completed once**; on
  completion it drops off and awards `assignments.points` **once**.

### 5.3 Anti-cheat

- Points are **derived in the DB** (views/functions join completions → task/assignment
  `points`). Completion rows carry no client-supplied point value. RLS ensures a user can only
  insert completions for **their own** `user_id` and only against **active** tasks/assignments.

---

## 6. Points & leaderboard

### 6.1 Totals

- `user_points` view: per user, `sum(daily task points) + sum(assignment points)`.

### 6.2 De-identified leaderboard

- `get_leaderboard()` `SECURITY DEFINER` function returns `{ rank, emoji, points, user_id }`:
  - **Non-admin callers:** `user_id` is `NULL` (names/ids are not resolvable).
  - **Admin callers:** `user_id` included so the UI can offer a reveal.
- The public leaderboard UI (all authenticated users, including admins in User view) shows
  **emoji + points + rank only — never names**.
- In **Admin view**, tapping a leaderboard row opens a confirm dialog
  *"هل أنت متأكد أنك تريد رؤية اسم المستخدم؟"*; on confirm it calls `get_user_name(uuid)`
  (admin-only) and reveals the name for that row.
- Names are **never** exposed to non-admins by any view or function.

---

## 7. Users tab (admin) & export

- Admin **Users** screen lists every user: **name, email, emoji, join date**, and their
  **task/assignment completion data** — **no points column** (points appear only on the
  de-identified leaderboard, so name + points are never shown together here).
- **Export** (existing `exceljs`, client-side, formula-injection guarded) is adapted to the
  new model: Users sheet, Daily completions matrix, Assignments + completions, Leaderboard.

---

## 8. Migrations & security

Forward-only migrations `0021+`:

- `0021_program_and_profiles` — seed single program; add `emoji` to `students`; retire
  PIN/must-change defaults; `handle_new_user()` trigger + `app_program()` + `is_admin()`.
- `0022_tasks` — `daily_tasks`, `daily_completions`, `assignments`,
  `assignment_completions`, enum, indexes.
- `0023_points_leaderboard` — `user_points` view, `get_leaderboard()`, `get_user_name()`.
- `0024_rls` — enable/FORCE RLS on new tables; policies: users read active tasks/assignments,
  read/write own completions; admins manage tasks/assignments and read profiles/names;
  leaderboard only via the functions.
- `0025_admin_mgmt` — helper(s) for the admin-creates-admin route.

Security posture retained: RLS default-deny + FORCE, `SECURITY DEFINER` helpers with pinned
`search_path`, DB-computed points, Postgres rate-limiter on mutating/auth routes, append-only
audit log (extended to cover register, task/assignment CRUD, completions, name reveals, admin
creation), strict CSP/headers, Zod on every route. Service-role key stays server-only.

The retired question/answer/criteria/point_events tables are left in place under default-deny
RLS (no UI references them); they can be dropped in a later cleanup migration.

---

## 9. Theme & branding

Palette derived from `logo.jpg` (pine-green wordmark on black) and `post.jpg` (forest→emerald
gradient, cream calligraphy, faint gold arabesque):

- **Primary:** deep forest green (~`#1b4332` / `#14352a`), replacing navy `#2A3563`.
- **Accent:** emerald/leaf-green gradient (~`#2d6a4f → #40916c`) for hero, top ranks,
  progress rings.
- **Neutrals:** warm cream/off-white surfaces in light mode (~`#f5f0e1`); near-black + green
  in dark mode (mirrors the logo on black).
- **Gold** (~`#c9a227`) kept for points, medals, streaks.
- **Texture:** faint arabesque/geometric background pattern (replaces the eightfold-geometry
  note).
- **Logo:** now **rendered** (reverses the old rule). Copy the wordmark into `public/`, produce
  a transparent-background version usable on cream and dark surfaces, and place it on the
  login/register screen, the top bar, and the PWA splash. Regenerate PWA app icons from the
  logo.
- **Fonts:** keep IBM Plex Sans Arabic for UI; a decorative Arabic display face for large
  headings is a nice-to-have, not a blocker.

Implemented via CSS variables in `app/globals.css` + `ThemeBoot`/`ThemeToggle`, so light/dark
both re-skin from one token set.

---

## 10. Module / route changes

```
app/
  (auth)/
    register/           NEW — name, email, password, emoji picker
    login/              email + password (adapted), resend-confirmation
    (removed) j/[slug], change-password (PIN)
  (user)/               renamed from (student)
    today/              daily tasks + persistent assignments
    leaderboard/        emoji + points + rank (no names)
    settings/           emoji change, passkey enroll, theme
  (admin)/
    admin/
      daily-tasks/      NEW — CRUD daily tasks
      assignments/      NEW — CRUD read/listen assignments
      users/            names + email + emoji + completions, no points
      leaderboard/      admin leaderboard with name-reveal
      admins/           NEW — create/list admins
      export/           adapted export
    layout with Admin ⇄ User switch
  api/
    auth/…              login (adapted), webauthn (kept)
    admins/create       NEW (service role)
    tasks/…, assignments/…, completions/…  as needed
    (removed) join, students create/delete/reset-pin, schedules clone/delete
lib/
  auth/                 role = admin | user; is_admin helper; view-mode store
  tasks/                daily + assignment queries/hooks (replaces questions/*)
  points/               totals mirror (display only)
  boards/               leaderboard queries (de-identified) — replaces boards/*
  excel/                export adapted
  offline/              mirror active tasks/assignments + own completions
```

Retired from the UI: `lib/questions/*`, grading/criteria/point_events screens, schedule &
group management, join-link code.

---

## 11. Offline

Student/user offline flow retained conceptually: on login, mirror the program's active daily
tasks + assignments + the user's own recent completions into IndexedDB (Dexie); completions
write locally and enqueue an outbox op keyed by `(user, task, done_date)` /
`(user, assignment)`; flush on reconnect; last-write-wins. Leaderboard is online-only.

---

## 12. Deployment (later — work stays local now)

Deliverables to finish with (not executed now): updated `docs/SETUP.md` covering Supabase
project creation, running `supabase/migrations/*.sql`, enabling **Confirm email** + redirect
URLs, seeding the first super admin, `.env` values, and Vercel + GitHub deploy steps.

---

## 13. Out of scope (v1 of this redesign)

Groups/rooms, managers, multi-program, in-app audio/file upload, push/email notifications
beyond Supabase's verification email, admin manual point bonuses/deductions, and merged
cross-program identity.
