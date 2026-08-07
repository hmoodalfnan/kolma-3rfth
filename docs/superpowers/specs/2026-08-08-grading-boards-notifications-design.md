# Design — Multi-select grading, fair group average, student notifications

Date: 2026-08-08
Status: Approved (design), pending implementation plan

## Context

المتابع الإيماني is a Next.js 16 + Supabase PWA that lets trip supervisors track
students' deeds and award/deduct points. This change covers three requested
features plus one scoped-for-later question.

Relevant existing code:
- Grading (التقييم): `app/(manage)/grading/GradingScreen.js`, POST/DELETE
  `app/api/grants/route.js`, RPCs `grant_student_points` / `grant_group_points`.
- Boards: `app/(manage)/boards/BoardsScreen.js` (`GroupsBoard`), views
  `v_student_totals` / `v_group_totals` in `supabase/migrations/0006_views.sql`,
  helpers in `lib/boards/queries.js` (`fetchGroupTotals`, `rankRows`).
- Student side: `components/student/StudentNav.js`, `app/(student)/today/DayGrants.js`,
  `lib/student/useStudentContext.js`, IndexedDB cache in `lib/offline/db.js`.
- `fetchStudentGrants(client, { studentId, limit })` already exists in
  `lib/boards/queries.js`.

## Feature 1 — Multi-select students in grading (التقييم)

### Goal
Let a supervisor select multiple students at once and apply the same
criterion / points / note / day to each, in the "تقييم طالب" panel. The group
panel ("تقييم مجموعة") is unchanged — it already broadcasts to a whole group.

### UI (`GradingScreen.js`, student `GrantForm`)
- Replace the single student `<Select>` with a multi-select picker:
  - Checkbox-style list of active students, each labeled with name + group.
  - A text filter to search by name.
  - A "تحديد الكل" / "إلغاء التحديد" affordance (and optionally select-all
    within a group).
  - A live count: "N طلاب محدّدين".
- Shared fields (criterion, points, note, day) apply to every selected student.
- Submit button reflects the count, e.g. `منح 5 نقاط لـ 8 طلاب` /
  `خصم 3 نقاط من 8 طلاب`.
- Empty selection disables submit.

### API (`app/api/grants/route.js`)
- Extend the existing `zod` discriminated union `target` with a third shape:
  ```
  { kind: 'students', studentIds: uuid[] }  // 1..200, deduplicated
  ```
- Handler loops server-side over the existing, already-authorized
  `grant_student_points` RPC — one call per student id — reusing its internal
  auth re-check and the existing per-event audit write.
- Best-effort semantics (approved): if one student fails, the others still
  succeed. Response shape:
  ```
  { ids: [uuid...], failed: [{ studentId, error }] }
  ```
- One HTTP round-trip. The single-student `{ kind: 'student', studentId }` path
  stays unchanged for backward compatibility.
- Client (`lib/manage/api.js` / `GradingScreen.js`): when >1 student selected,
  send `kind: 'students'`; surface any `failed` entries by name in a toast/error.

### Out of scope
Atomic all-or-nothing transaction. Not needed for a trip tool; the failed list
makes partial failure visible and re-runnable.

## Feature 2 — Group scoreboard: total ⇄ average toggle

### Goal
Rank groups fairly across different group sizes. Average per student answers
"which group is best" without penalizing small groups.

### Definition (approved)
`average = total_points ÷ member_count`, where `total_points` already includes
group-level collective awards. Computed in the UI from existing view columns —
**no DB migration**. `v_group_totals.total_points` and `member_count` already
exist; `GroupsBoard`'s ungrouped bucket already computes avg this same way.

### UI (`BoardsScreen.js`, `GroupsBoard`)
- Add a toggle: `ترتيب حسب: المعدل | الإجمالي`, defaulting to **المعدل**.
- Each row shows both metrics: the active-sort metric as the large number, the
  other as a subtitle (alongside the existing member count / group points line).
- `rankRows` keys off the active metric; the progress bar scales to the active
  metric's max.
- The ungrouped ("بدون مجموعة") pseudo-group participates in both sorts, using
  its already-computed average.
- Compute a per-row `avg_points = total_points / member_count` in the UI for
  real groups (do not rely on the view's `avg_points`, which divides by member
  points only) so total and average are consistent.

### Out of scope
Changing the DB view; student-facing board changes (the request targets the
manager groups board).

## Feature 3 — Student notifications tab

### Goal
Give students an in-app place that shows when an admin awarded or deducted
points, with the reason — so points no longer "appear from nowhere".

### Nav (`components/student/StudentNav.js`)
- New tab "التنبيهات" with a 🔔 icon and an unread-count badge.

### Screen (`app/(student)/notifications/page.js` + client component)
- Feed of every grant this student received (awards + deductions by admins, plus
  group awards applied to them — these already exist as child `point_events`
  with the student's id), newest first.
- Each row: criterion name, note (the "why"), signed points (green award /
  red deduction), and date.
- Reuses `fetchStudentGrants(client, { studentId })` — no schema change.
- Respects offline/loading states consistent with other student screens.

### Unread tracking (approved: local per-device)
- Store `notifications_seen_at` (timestamp) per student in the existing
  IndexedDB `meta` store (`lib/offline/db.js`), keyed per student id.
- Badge counts grants with `created_at > notifications_seen_at`.
- Opening the tab updates `notifications_seen_at` to now, clearing the badge.
- Trade-off: unread state is per-device. Acceptable — students use one phone on
  a trip.

### Out of scope
Server-synced read state; notifications for non-grant events (day closed, etc.).

## Scoped for later — Feature 4: time-based push notifications

Not built now. Documented conclusion:
- Web Push + a service-worker `push` handler delivers notifications even when the
  PWA is closed, on **Android** (Chrome/installed PWA) and **iOS 16.4+** (only
  when installed to the Home Screen; user must tap to allow).
- On-device local scheduling while closed is **not** reliably supported on either
  platform — timing must be triggered by a server.
- Implementation when pursued: VAPID key pair; store each student's push
  subscription; a scheduled server job (Supabase `pg_cron` + Edge Function) that
  sends pushes at the target time; extend `public/sw.js` (currently caching-only)
  with `push` + `notificationclick` handlers.

## Testing
- API: unit/integration for the `kind: 'students'` path — dedup, 1..200 bound,
  per-student success/failure aggregation, unchanged single-student path.
- Boards: the average and ranking math (total vs average sort, ungrouped bucket,
  zero-member guard) — pure functions, unit-testable.
- Notifications: unread count derivation from `seen_at` vs grant `created_at`,
  and mark-seen behavior.
- Follow existing Vitest patterns in `tests/`.
