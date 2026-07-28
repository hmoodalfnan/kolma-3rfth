# سجل الأعمال — Faith & Conduct Tracker: Design Spec

**Date:** 2026-07-28
**Status:** Approved for planning

---

## 1. Purpose

A mobile-first Arabic web app for tracking students' daily faith practices and conduct
during multi-day programs ("رحلات" / schedules), with points, streaks, group competition,
leaderboards, and a full audit trail.

Replaces a single-file localStorage prototype with a multi-tenant, multi-schedule system
backed by Supabase Postgres and deployed on Vercel.

---

## 2. Roles

| Role | Scope | Login |
|---|---|---|
| **Super Admin** | Everything, all schedules, global audit log, master question library, creates staff | username + password (8+ chars) |
| **Manager** | Only schedules they are assigned to. Full control within them. | username + password (8+ chars) |
| **Student** | Their own daily entries in one schedule. Leaderboard if enabled. | name picked from list + 6-digit PIN |

- A manager may be assigned to **many schedules**; a schedule may have **many managers**
  (`schedule_staff` is many-to-many).
- Optional `group_scope` on the assignment restricts a manager to specific groups inside a
  schedule. Null = full schedule access.
- Super admin is seeded once via SQL (`mohammed`); can create further super admins from the UI.
- A manager may **clone** a schedule they own (questions, groups, criteria, settings — never
  students or answers). Managers cannot clone schedules they are not assigned to.

---

## 3. Authentication

### 3.1 Mechanism

All three roles are real Supabase Auth users. Supabase requires an email address, so one is
synthesized internally and never shown or typed:

- Staff: `<username>@tracker.internal`
- Student: `stu_<student_id>@tracker.internal`

**Rationale:** bcrypt hashing, refresh-token rotation, and session persistence are handled by
Supabase; authorization is enforced in the database via RLS on `auth.uid()`. No service-role
key ever reaches the browser and no custom crypto is written.

### 3.2 Login flow

Login is **never** performed directly from the browser against GoTrue. It goes through
`POST /api/auth/login` (Next.js Route Handler) so that every attempt — success or failure —
is rate-limited, lockout-checked, and audit-logged.

1. Client posts `{ mode: 'staff'|'student', identifier, password, scheduleSlug? }`.
2. Route validates shape (Zod), checks IP + identifier rate limits, checks lockout.
3. Route calls `signInWithPassword` server-side with the synthesized email.
4. On failure: record attempt, increment lockout counter, return a **generic** error.
5. On success: reset counters, audit-log, return the session to the client, which calls
   `supabase.auth.setSession()` so the session persists in `localStorage`.

Sessions persist indefinitely (auto-refresh) until explicit logout — required so the app
boots offline.

### 3.3 Passwords

- **Student PIN:** exactly 6 digits, numeric only.
- **Staff password:** minimum 8 characters, must contain at least two of
  {lowercase, uppercase, digit, symbol}. Checked against a small common-password denylist.
- Manager creates students → a **printable one-time sheet** of temp PINs is shown.
- `must_change_password = true` forces a change-PIN screen on first login; the student sets
  their own 6 digits. The manager can never read a PIN afterward — only **reset** it, which
  generates a new temp PIN and re-arms the forced change.
- Staff passwords: same reset flow, performed by a super admin.

### 3.4 Join links

Each schedule has a cryptographically random slug (16 chars, base32, `crypto.randomBytes`):
`/j/<slug>`. Opening it lists **only that schedule's students** in the login dropdown.

- Optional **per-group links** (`groups.join_slug`) list only that group's students.
- Slugs are regenerable; regenerating invalidates the old link immediately.
- The endpoint backing the dropdown returns names and group labels only — never PINs,
  never IDs that are useful elsewhere.

---

## 4. Schedules

```
name, slug, start_date, end_date (NULLABLE), timezone ('Asia/Riyadh'),
status ('active'|'archived'), streak_threshold_pct (default 100),
backfill_days (default 3), students_see_leaderboard (bool), created_by
```

- **`end_date = NULL` means open-ended.** The schedule never auto-archives and runs
  indefinitely. Completion % denominators use *days elapsed since start* instead of total
  program length.
- With an end date: at midnight Asia/Riyadh after `end_date`, status flips to `archived`
  (a scheduled job plus a lazy check on read). Archived = read-only for students; still
  fully visible in leaderboards, exports, and the audit log. Managers can re-open.
- Groups (الغرف / المجموعات): configurable count, custom names, ordered, each with its own
  optional join slug.

---

## 5. Questions

### 5.1 Types

| `type` | UI | Points |
|---|---|---|
| `bool` | single checkbox | flat |
| `per_prayer` | 5 checkboxes (فجر/ظهر/عصر/مغرب/عشاء), subset configurable | per prayer |
| `single_choice` | radio list | per option; options may be **negative** |
| `multi_choice` | checkbox list | per option, summed |
| `counter` | number stepper | `points_per_unit × value`, capped by `max` |
| `rating` | 1–N stars | `points_per_star × value` |
| `text` | textarea | always 0 |

### 5.2 Question record

```
schedule_id, section, title, help_text, type, config jsonb, points,
active_weekdays int[] (null = all), active_from date, active_to date,
is_required bool, sort_order, archived_at
```

`config` shape per type:
- `single_choice` / `multi_choice`: `{ options: [{ id, label, points }] }`
- `per_prayer`: `{ prayers: ['fajr','dhuhr','asr','maghrib','isha'], points_per_prayer }`
- `counter`: `{ points_per_unit, max, unit_label }`
- `rating`: `{ max, points_per_star }`
- `bool` / `text`: `{}`

Config is validated by a Zod schema **and** a Postgres `CHECK` via a validation function, so
a malformed config cannot be persisted from any path.

### 5.3 Library vs schedule

- `question_library` is the super admin's master set. Managers see it read-only.
- A manager **copies** library questions into their schedule; the copy is independent.
  Editing the library later never mutates a running schedule.
- Managers may also author questions from scratch, and edit, reorder (drag), archive, or
  delete anything in their own schedule.
- Deleting a question that has answers **archives** it instead (`archived_at`), preserving
  history and past point totals.

### 5.4 Day scheduling

A question appears on date `D` for a schedule iff:
`(active_weekdays IS NULL OR dow(D) = ANY(active_weekdays))`
AND `(active_from IS NULL OR D >= active_from)`
AND `(active_to IS NULL OR D <= active_to)`
AND `archived_at IS NULL`.

---

## 6. Answers, points, streaks

### 6.1 Answers

```
student_id, question_id, entry_date, value jsonb, points numeric,
client_updated_at timestamptz, device_id text
UNIQUE (student_id, question_id, entry_date)
```

`value` by type: `bool` → boolean · `per_prayer` → `{fajr:true,…}` · `single_choice` →
option id · `multi_choice` → array of option ids · `counter`/`rating` → number ·
`text` → string.

### 6.2 Points are computed in the database

A `BEFORE INSERT OR UPDATE` trigger recomputes `answers.points` from the question's `config`
and the submitted `value`, ignoring any `points` the client sends. **A student who edits the
JavaScript in devtools cannot award themselves points.** The same function validates that
`value` matches the question's type and that submitted option ids exist in `config`.

A second trigger rejects writes where `entry_date` is outside
`[today - backfill_days, today]` in the schedule's timezone, or where the schedule is
archived — enforced server-side, not just in the UI. The window applies to student-authored
writes only (`app_role() = 'student'`); staff corrections are permitted at any date and are
audit-logged as such.

### 6.3 Derived metrics

- **Day completion %** = `sum(points earned) / sum(max possible points)` over that date's
  active questions.
- **Streak** = consecutive days ending today where day completion % ≥
  `schedule.streak_threshold_pct`.
- **Overall completion %** = same ratio across all elapsed days of the schedule.
- **Total points** = `sum(answers.points) + sum(point_events.points)`.

Computed by SQL views with supporting indexes. At the stated scale
(200 students × 10 schedules × ~30 questions × ~30 days ≈ 1.8M answer rows worst case)
live aggregation is comfortably fast; no denormalized totals table in v1.

---

## 7. Supervisor evaluation & group points

- `criteria` are **per schedule**, seeded on creation with الالتزام بالوقت / نظافة الغرفة /
  السلوك / المبادرة (المبادرة has `allow_negative = false`). Managers add, rename, remove.
- `point_events`: `{ schedule_id, student_id?, group_id?, criterion_id, points, note,
  created_by, applied_to_members }`.
- **Group grants** create one group-level event (drives the group leaderboard). If
  `applied_to_members` is checked, child per-student events are also created so the points
  reach personal totals. Group score and personal totals stay separately queryable.
- A grant against a criterion with `allow_negative = false` and negative points is rejected
  by a DB `CHECK`, not just by the UI.

---

## 8. Leaderboards

- **Per schedule, overall** — students ranked by total points; every row shows
  **name · group · schedule**.
- **Per schedule, per question** — "الأكثر التزاماً بالوتر" etc., for every question.
- **Groups** — total and average per member.
- **Super admin global board** — filter by schedule(s), date range, group(s), question(s),
  question type, criterion, role; sort by any column; group by student / group / schedule;
  compare schedules side by side; export any view. Every row always carries the student's
  group and schedule so a person is identifiable at a glance.
- Cross-schedule totals group by **normalized full name**; student records remain
  schedule-scoped (no merged person entity in v1).
- Student visibility is a per-schedule toggle (`students_see_leaderboard`), enforced in RLS.

---

## 9. Excel import / export

**Import (students):** `.xlsx`/`.csv` with exactly two columns — `الاسم` and
`الرمز` (optional; auto-generated when blank). The **group is chosen in the UI** at import
time, not in the file. Parsed **entirely client-side**; a preview table with per-row
validation errors is shown before anything is written; the file is never uploaded or stored.

**Export:** client-side `.xlsx` with sheets — Students summary · Daily matrix
(student × day × question) · Points ledger · Groups · Audit log. Every exported cell that
begins with `=`, `+`, `-`, or `@` is prefixed with `'` to prevent CSV/Excel formula
injection.

---

## 10. Audit log

Append-only. Records: logins and logouts (including failures), every answer tick/untick with
before → after values, point grants, question create/edit/delete, student add/import/remove/
PIN reset, group and criterion changes, schedule settings changes, slug regeneration, staff
account changes, and exports.

```
actor_user_id, actor_role, schedule_id, entity_type, entity_id, action,
before jsonb, after jsonb, ip inet, user_agent text, created_at
```

- Super admin: global view, filterable by actor, schedule, entity type, action, date range.
- Manager: only their own schedules' entries.
- No `UPDATE` or `DELETE` grant exists for any role — the table is insert-only at the
  privilege level, so the log cannot be rewritten even by a super admin through the app.

---

## 11. Offline

True offline for the student flow, not merely a cache.

- Service worker (`public/sw.js`, hand-rolled) precaches the app shell; cache-first for
  `/_next/static/*`, stale-while-revalidate for navigations, network-only for `/api/*`.
- On login, the student's schedule, groups, active questions, and last 30 days of their own
  answers mirror into IndexedDB (Dexie).
- Ticks write to IndexedDB immediately and enqueue an outbox op keyed by
  `(student_id, question_id, entry_date)`. Re-tapping the same item **replaces** the queued
  op rather than stacking duplicates.
- On reconnect (and on `visibilitychange`), the outbox flushes in order. Conflicts resolve
  last-write-wins by `client_updated_at`; the server rejects ops that violate the backfill
  window or archive rules and the client surfaces those rows for the student to see.
- A persistent banner shows connection state and queued-op count.
- After the first online login, the entire student flow works in airplane mode.

---

## 12. Security

Threats and controls, all enforced **server-side and in the database**, with the UI as a
convenience layer only.

**Authorization / IDOR.** RLS enabled and `FORCE`d on every table, default-deny. Policies
derive from `auth.uid()` via `SECURITY DEFINER` helper functions
(`app_role()`, `is_staff_of(schedule)`, `owns_student(student)`) with `search_path`
pinned to `pg_catalog, public`. (Named `app_role()`, not `current_role()` — the latter
collides with a PostgreSQL built-in.) A student can read and write only rows where
`students.auth_uid = auth.uid()`. A manager reaches only schedules present in
`schedule_staff` for them. No endpoint accepts a role or schedule id from the client as an
authorization input. Route handlers re-check authorization independently of RLS
(defence in depth), and the UI hides what the user cannot reach.

**Service role.** The `service_role` key exists only in Vercel server-side env vars, is used
only inside route handlers that need to create auth users (student/staff creation), and is
never sent to the browser or referenced in any client component.

**SQL injection.** All data access goes through supabase-js (parameterized PostgREST) or
`rpc()` calls to functions with typed arguments. No string-concatenated SQL anywhere. Any
dynamic identifier inside a function uses `format(%I)` / `quote_ident`.

**XSS.** React escapes by default; `dangerouslySetInnerHTML` is banned repo-wide (ESLint
`react/no-danger` set to error). All user-authored strings (question titles, option labels,
student names, notes) render as text nodes. A strict Content-Security-Policy is emitted from
`next.config.js` with per-request nonces: `default-src 'self'`, no `unsafe-inline`, no
`unsafe-eval`, `connect-src` limited to `'self'` and the Supabase project origin,
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.

**Other headers.** HSTS with preload, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` denying camera/mic/geo/USB.

**CSRF.** No auth cookies are used: the session lives in `localStorage` (required for the
offline boot) and route handlers authenticate via an `Authorization: Bearer <access_token>`
header, which browsers do not attach cross-site — so classic CSRF does not apply. As defence
in depth, every state-changing route handler additionally rejects requests whose `Origin` /
`Sec-Fetch-Site` is not same-origin.

**Brute force / rate limiting.** A Postgres-backed limiter (`rate_limits` table + `RPC`,
fixed-window with a sliding tail) applied to *every* mutating and auth endpoint, keyed by
IP and by identifier:
- Login: 5 failures per identifier → 15-minute lockout, doubling per subsequent lockout to
  a 24-hour cap; 20 attempts per IP per 10 minutes regardless of outcome.
- Change/reset password: 5 per hour per user.
- Import, export, bulk grant: 10 per hour per user.
- Generic endpoints: 120 requests per minute per IP.
Responses on limit are uniform `429` with no timing or message differences that would leak
whether an identifier exists. Failed logins always return the same generic error.

**Enumeration.** The join-link student list is intentional (students pick their name), but
it exposes names only, scoped to one schedule, behind an unguessable 16-char slug that the
manager can rotate. Staff usernames are never enumerable. Login errors never distinguish
"unknown user" from "wrong password".

**File handling.** Excel/CSV import is parsed in the browser only — nothing is uploaded and
nothing is written to disk or storage. Guards: 2 MB size cap, extension **and** magic-byte
check, 5,000-row / 10-column cap, formula cells rejected, all values coerced to strings and
length-capped before use. There is no file upload endpoint anywhere in the app, so there is
no file-inclusion or path-traversal surface.

**Input validation.** Every route handler validates its body with Zod (strict, unknown keys
rejected) before touching the database; the database re-validates via `CHECK` constraints,
enum types, foreign keys, and the point/config validation functions. Client-side validation
is duplicated purely for UX.

**Data integrity.** Points computed by trigger, never trusted from the client. Backfill
window, archive state, negative-point rules, and option-id membership all enforced by DB
constraints/triggers.

**Secrets & supply chain.** No secrets in the repo; `.env.local` gitignored; `.env.example`
documents required vars. `npm audit` clean at ship; dependency set kept small
(next, react, @supabase/supabase-js, zod, dexie, exceljs, tailwind). **`exceljs` is used for
Excel rather than the npm `xlsx` package**, whose npm-published version carries unpatched
prototype-pollution and ReDoS advisories.

**Logging.** Every auth event and every mutation is written to the append-only audit log
with actor, IP, and user agent.

---

## 13. UI / Design

- Arabic-only, RTL, `Asia/Riyadh`, mobile-first with thumb-reachable bottom navigation.
- Palette: navy `#2A3563` (from the program logo) as primary, warm gold `#C9A227` for
  points, medals, and streaks, cool slate neutrals. Light and dark themes, auto + manual.
- The logo's eight-fold geometry appears only as a faint background texture. **The logo mark
  itself is never rendered.**
- Typeface: IBM Plex Sans Arabic.
- **Skeleton loading on every list and panel**, **optimistic updates on every mutation**
  (with rollback and a toast on server rejection), and route/data prefetching on hover and
  on viewport entry.

---

## 14. Module boundaries

```
app/                    routes (App Router, JavaScript)
  (auth)/               join link, login, force-change-password
  (student)/            daily sheet, leaderboard, settings
  (manage)/             schedules, students, questions, grading, boards, export, log
  (admin)/              staff, library, global board, global log
  api/                  auth, students-create, import, admin-only mutations
lib/
  supabase/             browser + server clients
  auth/                 session, role guards, password policy
  questions/            type registry: config schema, renderer, scorer  ← single source
  points/               client-side mirror of the DB scorer (display only)
  offline/              dexie schema, outbox, sync engine
  excel/                import parser, export builders (exceljs)
  audit/                write helpers
  validation/           zod schemas shared by client and route handlers
components/             ui primitives, skeletons, question renderers
supabase/migrations/    SQL: schema, RLS policies, functions, triggers, seed
```

Each question type is one entry in a registry exposing `{ configSchema, Editor, Renderer,
score }`. Adding a type touches one file plus one SQL branch — nothing else.

---

## 15. Deployment

Supabase and Vercel projects do not exist yet. Deliverables: `supabase/migrations/*.sql`
runnable in the Supabase SQL editor, a seed script creating super admin `mohammed`,
`.env.example`, and a step-by-step setup/deploy guide.

---

## 16. Out of scope (v1)

Merged cross-schedule person identity · push notifications · email/SMS · file attachments ·
bilingual UI · offline for manager and admin views (student flow only) · native apps.
