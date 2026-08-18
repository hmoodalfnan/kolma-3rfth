# Self-Serve Tasks & Rebrand — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert the multi-trip, staff-provisioned, question-based tracker into a single-program, self-registration, task-based tracker with a de-identified emoji leaderboard and a green/cream brand from the logo.

**Architecture:** Next.js 16 App Router (JS) + Supabase (Postgres/Auth/RLS). Forward-only SQL migrations reshape the schema; UI is rewired from questions→tasks; theming via CSS variables. Points computed in the DB; RLS default-deny.

**Tech Stack:** Next.js 16, React 19, @supabase/supabase-js, zod, dexie, exceljs, tailwind v4, @simplewebauthn, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-self-serve-tasks-rebrand-design.md`

## Global Constraints

- Arabic-only, RTL, `Asia/Riyadh`.
- Points NEVER trusted from client — always derived in DB from task/assignment rows.
- RLS enabled + FORCE, default-deny, on every table. Helpers are `SECURITY DEFINER` with `set search_path = pg_catalog, public`.
- Names never exposed to non-admins by any view/function.
- Service-role key server-only; never in client bundle.
- Two roles only: `super_admin` (admin) and user (profile-only). Manager role retired.
- Single program; all task/leaderboard queries scoped to `app_program()`.
- Keep existing security posture: rate-limiter, append-only audit log, strict CSP/headers, Zod on every route.
- Work stays LOCAL (no push/deploy) until the user says otherwise.

---

## Phase 1 — Theme & branding (green/cream + logo)

Self-contained, visible, low-risk. No DB changes.

### Task 1.1: Prepare logo assets
**Files:**
- Create: `public/logo.png` (transparent wordmark), `public/logo-mark.svg` if feasible
- Modify: `scripts/generate-icons.mjs`, run `npm run icons`

- [ ] Copy `logo.jpg` → `public/`; produce a transparent-background PNG (sharp: threshold near-black → alpha) at `public/logo.png`.
- [ ] Point icon generator at the logo; regenerate `public/icons/*` + apple-touch + maskable.
- [ ] Verify icons exist; commit.

### Task 1.2: Recolor design tokens
**Files:** Modify `app/globals.css` (CSS variables), `components/ui/ThemeBoot.js`, `components/ui/ThemeToggle.js` (only if palette hard-coded)

- [ ] Replace navy tokens with forest-green primary (`#1b4332`), emerald accent (`#2d6a4f`/`#40916c`), cream surfaces (`#f5f0e1`), keep gold (`#c9a227`); define both light and dark token sets.
- [ ] Add a faint arabesque background texture (SVG data-uri) at low opacity.
- [ ] Manually verify light+dark in browser; commit.

### Task 1.3: Render the logo in-app
**Files:** Modify `app/(auth)/login/page.js`, new `app/(auth)/register/page.js` (Phase 3), `components/student/StudentTopBar.js`, `app/layout.js` (splash/meta)

- [ ] Add the logo to the login screen header and the top bar. Ensure it reads on both cream and dark backgrounds.
- [ ] Commit.

---

## Phase 2 — Database migrations (program, profiles, tasks, views, RLS)

### Task 2.1: Program + profiles + emoji + helpers
**Files:** Create `supabase/migrations/0021_program_and_profiles.sql`; Test `tests/sql/…` (manual verification notes)

- [ ] Add `emoji text` to `students` (nullable), `email text` mirror; set `must_change_password` default false.
- [ ] Seed a single program `schedules` row with fixed slug `program` (idempotent `on conflict do nothing`).
- [ ] `create function app_program() returns uuid` — returns the single program id.
- [ ] `create function is_admin() returns boolean` — true if `auth.uid()` in `app_users` with role super_admin.
- [ ] `handle_new_user()` AFTER INSERT on `auth.users`: if `raw_user_meta_data ? 'full_name'` and not `admin_provisioned`, insert `students(auth_uid, full_name, emoji, schedule_id=app_program())`.
- [ ] Manually apply in a scratch DB / note; commit.

### Task 2.2: Task tables
**Files:** Create `supabase/migrations/0022_tasks.sql`

- [ ] `daily_tasks`, `daily_completions` (unique user+task+date), `assignment_kind_t` enum, `assignments`, `assignment_completions` (unique user+assignment) per spec §5. Add indexes.
- [ ] Commit.

### Task 2.3: Points + leaderboard functions
**Files:** Create `supabase/migrations/0023_points_leaderboard.sql`

- [ ] `user_points` view: per user sum of daily + assignment points (join completions→points).
- [ ] `get_leaderboard()` SECURITY DEFINER: returns rank, emoji, points, and user_id (NULL unless `is_admin()`).
- [ ] `get_user_name(uuid)` SECURITY DEFINER: admin-only, returns full_name.
- [ ] Commit.

### Task 2.4: RLS
**Files:** Create `supabase/migrations/0024_rls.sql`

- [ ] Enable+FORCE RLS on the 4 new tables. Policies: authenticated users select active tasks/assignments; users insert/select/delete own completions; admins full CRUD on tasks/assignments; profiles select own + admin; leaderboard only via functions.
- [ ] Commit.

---

## Phase 3 — Auth (register, login, email verification, roles)

### Task 3.1: Registration page + emoji picker
**Files:** Create `app/(auth)/register/page.js`, `app/(auth)/register/RegisterForm.js`, `components/ui/EmojiPicker.js`, `lib/identity/emojis.js`; Modify `lib/validation/auth.js`

- [ ] Emoji gallery constant (~50). Zod schema: name, email, password policy, emoji.
- [ ] `signUp` with metadata `{ full_name, emoji }`, `emailRedirectTo`. Handle success (show "verify email") + errors.
- [ ] Commit.

### Task 3.2: Login adaptation + resend + role routing
**Files:** Modify `app/(auth)/login/page.js`, `app/(auth)/login/StaffLogin.js`→unified, `app/api/auth/login/route.js`, `lib/auth/*`

- [ ] Unified email+password login; on `email_not_confirmed` show resend button. Resolve role post-login (admin vs user) and route.
- [ ] Remove PIN/join-link/change-password flows and files.
- [ ] Commit.

### Task 3.3: Role model + view-mode store
**Files:** Modify `lib/auth/identity.js`, `lib/auth/guard.js`; Create `lib/auth/viewMode.js`

- [ ] `role = 'admin' | 'user'`; `useViewMode` (localStorage) for Admin⇄User; guards updated.
- [ ] Commit.

---

## Phase 4 — User app (tasks, assignments, leaderboard, settings)

### Task 4.1: lib/tasks queries + hooks
**Files:** Create `lib/tasks/queries.js`, `lib/tasks/useToday.js`; Test `tests/tasks/*.test.js`

- [ ] Fetch active daily tasks + today's completions; active assignments + user completions; toggle helpers (optimistic). Unit-test the merge/derive logic.
- [ ] Commit.

### Task 4.2: Today screen
**Files:** Create `app/(user)/today/page.js` + components; retire `app/(student)/today/*`

- [ ] Daily tasks checklist + persistent assignments (read/listen) with mark-done; points shown per item; skeletons + optimistic + toast.
- [ ] Commit.

### Task 4.3: Leaderboard (de-identified)
**Files:** Create `app/(user)/leaderboard/page.js`, `lib/boards/leaderboard.js`

- [ ] Render `get_leaderboard()` rows: rank + emoji + points. No names. Top-3 emphasis.
- [ ] Commit.

### Task 4.4: Settings (emoji, passkey, theme)
**Files:** Modify `app/(student)/settings/*`→`(user)/settings`

- [ ] Change emoji; enroll passkey (existing WebAuthn); theme toggle.
- [ ] Commit.

---

## Phase 5 — Admin

### Task 5.1: Daily tasks CRUD
**Files:** Create `app/(admin)/admin/daily-tasks/*`, `lib/admin/tasks.js`
- [ ] List/create/edit/archive daily tasks (title, description, points, active, order). Commit.

### Task 5.2: Assignments CRUD
**Files:** Create `app/(admin)/admin/assignments/*`
- [ ] CRUD read/listen assignments (kind, title, body_text, points, active). Commit.

### Task 5.3: Users tab (no points)
**Files:** Create `app/(admin)/admin/users/*`
- [ ] Table: name, email, emoji, join date, completion counts. No points column. Commit.

### Task 5.4: Admin leaderboard + name reveal
**Files:** Create `app/(admin)/admin/leaderboard/*`
- [ ] Emoji leaderboard; row tap → ConfirmDialog "هل أنت متأكد أنك تريد رؤية اسم المستخدم؟" → `get_user_name`. Commit.

### Task 5.5: Admins management
**Files:** Repurpose `app/(admin)/admin/staff/*`→`admins`; Create `app/api/admins/create/route.js`
- [ ] List admins; create admin (service role: auth user + app_users super_admin + profile, metadata `admin_provisioned`). Commit.

### Task 5.6: Admin⇄User switch in layout
**Files:** Modify `app/(admin)/layout.js`, top bar
- [ ] Toggle visible to admins; routes to user app / admin app. Commit.

---

## Phase 6 — Export & offline adapt

### Task 6.1: Export
**Files:** Modify `lib/excel/export.js`, `app/(admin)/admin/export/*` (from `(manage)/export`)
- [ ] Sheets: Users, Daily completions matrix, Assignments+completions, Leaderboard. Keep formula-injection guard. Commit.

### Task 6.2: Offline mirror
**Files:** Modify `lib/offline/db.js`, `sync.js`, `outbox.js`
- [ ] Mirror active tasks/assignments + own completions; outbox keyed per spec §11. Commit.

---

## Phase 7 — Cleanup & deploy docs (deploy later)

### Task 7.1: Retire legacy question/grading UI
- [ ] Remove `lib/questions/*`, grading/criteria/boards/schedules/groups screens & routes no longer reachable; keep dormant tables. Ensure build + tests pass. Commit.

### Task 7.2: Setup/deploy guide
**Files:** Modify `docs/SETUP.md`, `.env.example`
- [ ] Supabase project, run migrations, enable Confirm email + redirect URLs, seed first admin, env, Vercel + GitHub steps. Commit.

---

## Self-review notes
- Spec coverage: §2 roles→P3/5; §3 auth→P3; §4 program→P2.1/P7; §5 tasks→P2.2/P4/P5; §6 points/leaderboard→P2.3/P4.3/P5.4; §7 users/export→P5.3/P6.1; §8 migrations/security→P2; §9 theme→P1; §10 routes→all; §11 offline→P6.2; §12 deploy→P7.2. ✅
- Retiring legacy is P7 to avoid breaking earlier phases mid-flight.
