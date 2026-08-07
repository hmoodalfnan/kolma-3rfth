# Grading / Boards / Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select student grading, a fair total⇄average group-board toggle, and an in-app student notifications tab with an unread badge.

**Architecture:** Pure, unit-testable helpers hold the new logic (batch-grant result aggregation, group-average math, unread-count). Thin UI/route layers consume them. No DB migration — the group average is computed in the UI from existing view columns, and unread state lives in the existing IndexedDB `meta` store.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase JS, Dexie (IndexedDB), Zod, Vitest + Testing Library. RTL Arabic UI, Tailwind v4.

## Global Constraints

- All user-facing copy is Arabic, matching existing tone (e.g. `منح`, `خصم`, `المعدل`, `التنبيهات`).
- Node runtime routes keep `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- Reuse existing helpers: `rankRows` (`lib/boards/queries.js`), `fetchStudentGrants` (`lib/boards/queries.js`), `db.meta` (`lib/offline/db.js`), `post` (`lib/manage/api.js`).
- Points bound stays `|points| <= 1000` and `points !== 0`; a non-negative criterion clamps to `Math.abs`.
- Grants best-effort: a failed student does not abort the others; the caller is told who failed.
- Tests use `import` aliases (`@/...`) and the fake-client pattern in `tests/boards/queries.test.js`.
- Run the full suite with `npm test` before each commit; individual file with `npx vitest run tests/<path>`.

---

## Feature 1 — Multi-select students in grading

### Task 1: Extract & extend the grant validation schema

**Files:**
- Create: `lib/validation/grants.js`
- Modify: `app/api/grants/route.js` (replace inline `grantSchema` with the import)
- Test: `tests/validation/grants.test.js`

**Interfaces:**
- Produces: `grantSchema` (zod) whose `target` union now includes
  `{ kind: 'students', studentIds: string[] }` (1..200 uuids, deduplicated),
  alongside the existing `student` and `group` variants.

- [ ] **Step 1: Write the failing test**

```js
// tests/validation/grants.test.js
import { describe, it, expect } from 'vitest';
import { grantSchema } from '@/lib/validation/grants';

const base = {
  scheduleId: '11111111-1111-1111-1111-111111111111',
  criterionId: '22222222-2222-2222-2222-222222222222',
  points: 5,
};
const u = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

describe('grantSchema students variant', () => {
  it('accepts a list of student ids and defaults note to empty', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [u('a'), u('b')] },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.target.studentIds).toHaveLength(2);
    expect(parsed.data.note).toBe('');
  });

  it('deduplicates repeated ids', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [u('a'), u('a'), u('b')] },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.target.studentIds).toEqual([u('a'), u('b')]);
  });

  it('rejects an empty id list', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it('still accepts the single-student variant', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'student', studentId: u('a') },
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validation/grants.test.js`
Expected: FAIL — cannot resolve `@/lib/validation/grants`.

- [ ] **Step 3: Create the schema module**

```js
// lib/validation/grants.js
import { z } from 'zod';

export const grantSchema = z
  .object({
    scheduleId: z.string().uuid(),
    criterionId: z.string().uuid(),
    points: z
      .number()
      .finite()
      .refine((n) => n !== 0, 'النقاط يجب ألا تكون صفراً')
      .refine((n) => Math.abs(n) <= 1000, 'النقاط خارج الحدود المسموحة'),
    note: z.string().max(500).default(''),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح')
      .optional(),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('student'), studentId: z.string().uuid() }).strict(),
      z
        .object({
          kind: z.literal('students'),
          studentIds: z
            .array(z.string().uuid())
            .min(1, 'اختر طالباً واحداً على الأقل')
            .max(200, 'عدد الطلاب كبير جداً')
            // Same points twice on the same student would be a real double-grant.
            .transform((ids) => [...new Set(ids)]),
        })
        .strict(),
      z
        .object({
          kind: z.literal('group'),
          groupId: z.string().uuid(),
          applyToMembers: z.boolean().default(false),
        })
        .strict(),
    ]),
  })
  .strict();
```

- [ ] **Step 4: Point the route at the shared schema**

In `app/api/grants/route.js`: delete the inline `const grantSchema = z.object(...)` block and add at the top with the other imports:

```js
import { grantSchema } from '@/lib/validation/grants';
```

Leave `import { z } from 'zod';` in place only if still used elsewhere in the file; otherwise remove it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/validation/grants.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/validation/grants.js app/api/grants/route.js tests/validation/grants.test.js
git commit -m "feat: multi-student grant schema"
```

---

### Task 2: Batch-grant result aggregation helper

**Files:**
- Create: `lib/grants/batch.js`
- Test: `tests/grants/batch.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `summarizeGrants(outcomes)` where `outcomes` is
  `Array<{ studentId: string, id: string|null, error: string|null }>` →
  returns `{ ids: string[], failed: Array<{ studentId, error }> }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/grants/batch.test.js
import { describe, it, expect } from 'vitest';
import { summarizeGrants } from '@/lib/grants/batch';

describe('summarizeGrants', () => {
  it('collects successful ids and failures separately', () => {
    const { ids, failed } = summarizeGrants([
      { studentId: 'a', id: 'e1', error: null },
      { studentId: 'b', id: null, error: 'boom' },
      { studentId: 'c', id: 'e2', error: null },
    ]);
    expect(ids).toEqual(['e1', 'e2']);
    expect(failed).toEqual([{ studentId: 'b', error: 'boom' }]);
  });

  it('supplies a fallback message when an error string is missing', () => {
    const { failed } = summarizeGrants([{ studentId: 'b', id: null, error: null }]);
    expect(failed[0].error).toBeTruthy();
  });

  it('handles an all-success batch', () => {
    const { ids, failed } = summarizeGrants([{ studentId: 'a', id: 'e1', error: null }]);
    expect(ids).toEqual(['e1']);
    expect(failed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grants/batch.test.js`
Expected: FAIL — cannot resolve `@/lib/grants/batch`.

- [ ] **Step 3: Implement the helper**

```js
// lib/grants/batch.js

/**
 * Fold per-student RPC outcomes into a success/failure summary.
 * Grants are best-effort: one student failing must not hide the rest.
 */
export function summarizeGrants(outcomes) {
  const ids = [];
  const failed = [];
  for (const o of outcomes) {
    if (o.id) ids.push(o.id);
    else failed.push({ studentId: o.studentId, error: o.error || 'تعذّر تسجيل النقاط' });
  }
  return { ids, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grants/batch.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/grants/batch.js tests/grants/batch.test.js
git commit -m "feat: batch grant result summary"
```

---

### Task 3: Handle the `students` target in the grants route

**Files:**
- Modify: `app/api/grants/route.js:postHandler`

**Interfaces:**
- Consumes: `grantSchema` (Task 1), `summarizeGrants` (Task 2), existing
  `grant_student_points` RPC, existing `writeAudit`.
- Produces: for `kind: 'students'`, a `200` JSON `{ ids, failed }`. The
  `student` and `group` responses are unchanged (`{ id }`).

- [ ] **Step 1: Add the import**

At the top of `app/api/grants/route.js`:

```js
import { summarizeGrants } from '@/lib/grants/batch';
```

- [ ] **Step 2: Branch on the new target kind**

In `postHandler`, the current code builds a single `rpc` for `student` vs `group` and then does `const { data, error } = await rpc;`. Replace that whole block (from `const rpc = ...` through the single audit write and `return json({ id: data }, 200);`) with an explicit branch. Keep the existing criterion lookup and `allow_negative` check above it untouched.

```js
if (target.kind === 'students') {
  const outcomes = [];
  for (const studentId of target.studentIds) {
    const { data, error } = await scoped.rpc('grant_student_points', {
      p_schedule: scheduleId,
      p_student: studentId,
      p_criterion: criterionId,
      p_points: points,
      p_note: note,
      p_entry_date: entryDate ?? null,
    });
    outcomes.push({ studentId, id: data ?? null, error: error?.message ?? null });
  }

  const { ids, failed } = summarizeGrants(outcomes);

  for (const o of outcomes) {
    if (!o.id) continue;
    await writeAudit(db, {
      actorLabel: profile.username,
      actorRole: profile.role,
      scheduleId,
      entityType: 'point_event',
      entityId: o.id,
      action: 'grant',
      after: {
        criterion: criterion.name,
        points,
        note,
        target: { kind: 'student', studentId: o.studentId },
        entryDate: entryDate ?? null,
      },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  return json({ ids, failed }, 200);
}

const rpc =
  target.kind === 'student'
    ? scoped.rpc('grant_student_points', {
        p_schedule: scheduleId,
        p_student: target.studentId,
        p_criterion: criterionId,
        p_points: points,
        p_note: note,
        p_entry_date: entryDate ?? null,
      })
    : scoped.rpc('grant_group_points', {
        p_schedule: scheduleId,
        p_group: target.groupId,
        p_criterion: criterionId,
        p_points: points,
        p_note: note,
        p_apply_to_members: target.applyToMembers,
        p_entry_date: entryDate ?? null,
      });

const { data, error } = await rpc;
if (error) return json({ error: error.message || 'تعذّر تسجيل النقاط' }, 400);

await writeAudit(db, {
  actorLabel: profile.username,
  actorRole: profile.role,
  scheduleId,
  entityType: 'point_event',
  entityId: data,
  action: 'grant',
  after: { criterion: criterion.name, points, note, target, entryDate: entryDate ?? null },
  ip: clientIp(request),
  userAgent: userAgent(request),
});

return json({ id: data }, 200);
```

- [ ] **Step 3: Write the route test**

```js
// tests/api/grants.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/http/guard', () => ({
  requireStaff: async () => ({
    db: { from },
    scoped: { rpc },
    profile: { username: 'admin', role: 'manager' },
  }),
  staffsSchedule: async () => true,
}));
vi.mock('@/lib/audit/write', () => ({ writeAudit: async () => {} }));

const { POST } = await import('@/app/api/grants/route');

const u = (c) => `${c}`.repeat(8) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(4) + '-' + `${c}`.repeat(12);

const post = (body) =>
  POST(
    new Request('https://tracker.app/api/grants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://tracker.app' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  // criterion lookup: allow_negative true, belongs to schedule
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: u('2'), name: 'التعاون', allow_negative: true, schedule_id: u('1') },
        }),
      }),
    }),
  });
});

describe('POST /api/grants (students)', () => {
  it('grants to every selected student and reports failures', async () => {
    let n = 0;
    rpc.mockImplementation(async () => {
      n += 1;
      if (n === 2) return { data: null, error: { message: 'nope' } };
      return { data: `event-${n}`, error: null };
    });

    const res = await post({
      scheduleId: u('1'),
      criterionId: u('2'),
      points: 5,
      target: { kind: 'students', studentIds: [u('a'), u('b'), u('c')] },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ids).toEqual(['event-1', 'event-3']);
    expect(body.failed).toEqual([{ studentId: u('b'), error: 'nope' }]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/api/grants.test.js`
Expected: PASS. If `requireStaff`'s real signature differs, adjust the mock to return the same shape the handler destructures (`{ db, scoped, profile }`) — confirm against `lib/http/guard.js`.

- [ ] **Step 5: Commit**

```bash
git add app/api/grants/route.js tests/api/grants.test.js
git commit -m "feat: grant points to multiple students in one request"
```

---

### Task 4: Multi-select picker in the student grading panel

**Files:**
- Modify: `app/(manage)/grading/GradingScreen.js`

**Interfaces:**
- Consumes: `grantPoints` (`lib/manage/api.js`) — now may return `{ ids, failed }`.
- Produces: the "تقييم طالب" panel submits `target: { kind: 'students', studentIds }`
  when 2+ students are picked, or `{ kind: 'student', studentId }` for exactly one.

- [ ] **Step 1: Add a multi-target mode to `GrantForm`**

Add a `multiTarget` prop (default `false`). When `true`, instead of the `<Select>` for the target, render a searchable checkbox list. Add local state near the other `useState` calls in `GrantForm`:

```js
const [selectedIds, setSelectedIds] = useState([]);
const [filter, setFilter] = useState('');
```

Replace the single-target `<Field label="الهدف">…</Field>` block with a conditional:

```jsx
{multiTarget ? (
  <Field label="الطلاب" htmlFor={`${title}-filter`}>
    <div className="space-y-2">
      <Input
        id={`${title}-filter`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="ابحث بالاسم…"
      />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{selectedIds.length} طلاب محدّدين</span>
        <span className="flex gap-2">
          <button
            type="button"
            className="font-semibold text-brand"
            onClick={() => setSelectedIds(visibleTargets.map((t) => t.id))}
          >
            تحديد الكل
          </button>
          <button
            type="button"
            className="font-semibold text-muted"
            onClick={() => setSelectedIds([])}
          >
            إلغاء التحديد
          </button>
        </span>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
        {visibleTargets.map((t) => {
          const on = selectedIds.includes(t.id);
          return (
            <li key={t.id}>
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-chip">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setSelectedIds((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id),
                    )
                  }
                  className="size-5 accent-[color:var(--color-accent)]"
                />
                <span className="min-w-0 truncate">{t.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  </Field>
) : (
  <Field label="الهدف" htmlFor={`${title}-target`}>
    <Select id={`${title}-target`} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
      {targets.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </Select>
  </Field>
)}
```

Add the filtered list just above the `if (targets.length === 0)` guard:

```js
const visibleTargets = useMemo(() => {
  const q = filter.trim();
  return q ? targets.filter((t) => t.label.includes(q)) : targets;
}, [targets, filter]);
```

- [ ] **Step 2: Make submit understand the multi selection**

In `GrantForm`'s `run`, branch on `multiTarget`. Replace the body of `run` with:

```js
const run = async () => {
  const value = Number(points);
  if (!value) return;
  const signed = criterion?.allow_negative ? value : Math.abs(value);

  setBusy(true);
  if (multiTarget) {
    if (selectedIds.length === 0) {
      setBusy(false);
      return;
    }
    await onSubmit(criterionId, signed, note, selectedIds, applyToMembers, entryDate);
  } else {
    await onSubmit(criterionId, signed, note, targetId, applyToMembers, entryDate);
  }
  setNote('');
  setBusy(false);
};
```

Update the submit button's `disabled` and label to reflect the count when `multiTarget`:

```jsx
<Button
  loading={busy}
  disabled={multiTarget ? selectedIds.length === 0 || !Number(points) : !Number(points)}
  tone={Number(points) < 0 ? 'danger' : 'primary'}
  onClick={run}
>
  {(() => {
    const n = Math.abs(Number(points)) || 0;
    const who = multiTarget ? `${selectedIds.length} طلاب` : '';
    if (Number(points) < 0) return multiTarget ? `خصم ${n} نقطة من ${who}` : `خصم ${n} نقطة`;
    return multiTarget ? `منح ${n} نقطة لـ ${who}` : `منح ${Number(points) || 0} نقطة`;
  })()}
</Button>
```

- [ ] **Step 3: Wire the student panel to multi mode**

In `GradingScreen`, change the first `<GrantForm title="تقييم طالب" …>` to pass `multiTarget` and build the right target from the array:

```jsx
<GrantForm
  title="تقييم طالب"
  multiTarget
  schedule={current}
  criteria={criteria}
  targets={students.map((s) => ({
    id: s.id,
    label: `${s.full_name} — مجموعة: ${groups.find((g) => g.id === s.group_id)?.name ?? 'بدون مجموعة'}`,
  }))}
  emptyLabel="لا يوجد طلاب نشطون."
  onSubmit={(criterionId, points, note, ids, _members, entryDate) =>
    submit(
      {
        criterionId,
        points,
        note,
        entryDate,
        target:
          ids.length === 1
            ? { kind: 'student', studentId: ids[0] }
            : { kind: 'students', studentIds: ids },
      },
      students,
    )
  }
/>
```

- [ ] **Step 4: Report partial failures in `submit`**

Replace `submit` in `GradingScreen` with a version that names failed students:

```js
const submit = async (payload, roster = []) => {
  try {
    const res = await grantPoints({ scheduleId: current.id, ...payload });
    await load();
    if (res?.failed?.length) {
      const names = res.failed
        .map((f) => roster.find((s) => s.id === f.studentId)?.full_name ?? 'طالب')
        .join('، ');
      toast.push(`تعذّر تسجيل النقاط لـ: ${names}`, 'error');
    } else {
      toast.push('تم تسجيل النقاط', 'success');
    }
  } catch (err) {
    setError(err.message);
  }
};
```

The group `GrantForm` call still calls `submit({...})` with no roster — that's fine (`res.failed` is undefined for the group/single paths).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open a schedule → التقييم. Confirm: filtering by name narrows the list; تحديد الكل selects the visible set; the button shows the live count; granting to several students updates "آخر العمليات" with one row each; a non-negative criterion disables the minus quick-buttons.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test
git add app/(manage)/grading/GradingScreen.js
git commit -m "feat: select several students and grade them at once"
```

---

## Feature 2 — Group board total ⇄ average toggle

### Task 5: Group-metrics helper (average + ranked rows)

**Files:**
- Create: `lib/boards/group-metrics.js`
- Test: `tests/boards/group-metrics.test.js`

**Interfaces:**
- Consumes: `rankRows` from `lib/boards/queries.js`.
- Produces: `buildGroupRows({ groups, students, metric })` → ranked rows. Each row
  carries `group_id, group_name, member_count, total_points, group_points,
  avg_points, rank`, plus an `ungrouped: boolean` flag. `metric` is
  `'avg_points' | 'total_points'` and drives both sort order and `rank`.
  Includes a synthetic "بدون مجموعة" bucket when loose students exist.
  `avg_points = member_count ? round(total_points / member_count, 1) : 0`.

- [ ] **Step 1: Write the failing test**

```js
// tests/boards/group-metrics.test.js
import { describe, it, expect } from 'vitest';
import { buildGroupRows } from '@/lib/boards/group-metrics';

const groups = [
  { group_id: 'g1', group_name: 'أ', member_count: 2, total_points: 100, group_points: 0 },
  { group_id: 'g2', group_name: 'ب', member_count: 5, total_points: 150, group_points: 0 },
];
const students = [
  { student_id: 's1', group_id: 'g1', total_points: 50 },
  { student_id: 's2', group_id: 'g1', total_points: 50 },
  { student_id: 's3', group_id: 'g2', total_points: 30 },
];

describe('buildGroupRows', () => {
  it('computes average as total over member count', () => {
    const rows = buildGroupRows({ groups, students, metric: 'total_points' });
    const g1 = rows.find((r) => r.group_id === 'g1');
    expect(g1.avg_points).toBe(50);
  });

  it('ranks by total when metric is total_points', () => {
    const rows = buildGroupRows({ groups, students, metric: 'total_points' });
    expect(rows.map((r) => r.group_id)).toEqual(['g2', 'g1']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('ranks by average when metric is avg_points (small strong group wins)', () => {
    const rows = buildGroupRows({ groups, students, metric: 'avg_points' });
    // g1 avg 50 > g2 avg 30
    expect(rows.map((r) => r.group_id)).toEqual(['g1', 'g2']);
  });

  it('adds an ungrouped bucket for loose students and flags it', () => {
    const rows = buildGroupRows({
      groups,
      students: [...students, { student_id: 's9', group_id: null, total_points: 200 }],
      metric: 'avg_points',
    });
    const loose = rows.find((r) => r.ungrouped);
    expect(loose).toBeTruthy();
    expect(loose.member_count).toBe(1);
    expect(loose.avg_points).toBe(200);
  });

  it('never divides by zero for an empty group', () => {
    const rows = buildGroupRows({
      groups: [{ group_id: 'g0', group_name: 'ف', member_count: 0, total_points: 0, group_points: 0 }],
      students: [],
      metric: 'avg_points',
    });
    expect(rows[0].avg_points).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/boards/group-metrics.test.js`
Expected: FAIL — cannot resolve `@/lib/boards/group-metrics`.

- [ ] **Step 3: Implement the helper**

```js
// lib/boards/group-metrics.js
import { rankRows } from '@/lib/boards/queries';

const UNGROUPED = '__ungrouped__';
const avg = (total, count) => (count ? Math.round((Number(total) / count) * 10) / 10 : 0);

/**
 * Group rows with a fair per-student average and a ranking driven by the
 * chosen metric. Average divides the group's whole score (student points plus
 * collective awards) by head-count, so a small strong group is not buried under
 * a big average one. Loose students fold into a synthetic bucket so they still
 * appear.
 */
export function buildGroupRows({ groups, students, metric }) {
  const rows = groups.map((g) => ({
    group_id: g.group_id,
    group_name: g.group_name,
    member_count: Number(g.member_count) || 0,
    total_points: Number(g.total_points) || 0,
    group_points: Number(g.group_points) || 0,
    avg_points: avg(g.total_points, Number(g.member_count) || 0),
    ungrouped: false,
  }));

  const loose = students.filter((s) => !s.group_id);
  if (loose.length > 0) {
    const total = loose.reduce((sum, s) => sum + Number(s.total_points), 0);
    rows.push({
      group_id: UNGROUPED,
      group_name: 'بدون مجموعة',
      member_count: loose.length,
      total_points: total,
      group_points: 0,
      avg_points: avg(total, loose.length),
      ungrouped: true,
    });
  }

  const key = metric === 'avg_points' ? 'avg_points' : 'total_points';
  const sorted = [...rows].sort((a, b) => b[key] - a[key]);
  return rankRows(sorted, key);
}

export { UNGROUPED };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/boards/group-metrics.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/boards/group-metrics.js tests/boards/group-metrics.test.js
git commit -m "feat: fair group average and metric-driven ranking"
```

---

### Task 6: Wire the toggle into the groups board

**Files:**
- Modify: `app/(manage)/boards/BoardsScreen.js` (`GroupsBoard`)

**Interfaces:**
- Consumes: `buildGroupRows`, `UNGROUPED` (Task 5).

- [ ] **Step 1: Replace the inline ungrouped/rank logic with the helper + a toggle**

In `BoardsScreen.js`: remove the local `const UNGROUPED = '__ungrouped__';` and the `withUngrouped` `useMemo`. Import the helper:

```js
import { buildGroupRows, UNGROUPED } from '@/lib/boards/group-metrics';
```

Add sort state at the top of `GroupsBoard`:

```js
const [metric, setMetric] = useState('avg_points'); // fair default
```

Compute rows from the helper (replaces `withUngrouped`):

```js
const groupRows = useMemo(() => {
  if (!rows) return null;
  return buildGroupRows({ groups: rows, students, metric });
}, [rows, students, metric]);
```

Then rename every later use of `withUngrouped` to `groupRows`, and base `best` on the active metric:

```js
const best = groupRows?.[0] ? Number(groupRows[0][metric]) || 1 : 1;
```

- [ ] **Step 2: Render the toggle above the list**

Immediately inside `<Panel title="ترتيب المجموعات">`, before the list, add:

```jsx
<div className="mb-3 flex items-center gap-2 text-sm">
  <span className="text-muted">ترتيب حسب:</span>
  {[
    { id: 'avg_points', label: 'المعدل' },
    { id: 'total_points', label: 'الإجمالي' },
  ].map((m) => (
    <button
      key={m.id}
      type="button"
      onClick={() => setMetric(m.id)}
      aria-pressed={metric === m.id}
      className={`rounded-lg px-3 py-1.5 font-semibold ${
        metric === m.id ? 'bg-accent text-accent-ink' : 'chip'
      }`}
    >
      {m.label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Show both metrics per row; big number = active metric**

In the group row, replace the subtitle line and the trailing big number.

Subtitle (keep member count + group points, add both metrics with the inactive one muted):

```jsx
<span className="block text-xs text-muted">
  {g.member_count} طالب · معدل {Number(g.avg_points)} · الإجمالي {Number(g.total_points)} · نقاط جماعية{' '}
  {Number(g.group_points)}
</span>
```

Progress bar width uses the active metric:

```jsx
style={{ width: `${Math.max(2, (Number(g[metric]) / best) * 100)}%` }}
```

Trailing big number shows the active metric:

```jsx
<span className="font-bold tabular-nums text-brand" dir="ltr">
  {Number(g[metric])}
</span>
```

Replace the `g.group_id === UNGROUPED` checks that used the removed local constant — they now use the imported `UNGROUPED` (same value) and the `g.ungrouped` flag is also available if preferred.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open المجموعات. Confirm default sort is المعدل; toggling to الإجمالي re-orders and changes the big number and bar; a small high-scoring group ranks above a large mediocre one under المعدل; the "بدون مجموعة" bucket still appears and expands to its students.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add app/(manage)/boards/BoardsScreen.js
git commit -m "feat: rank groups by average or total with a toggle"
```

---

## Feature 3 — Student notifications tab

### Task 7: Unread-count logic + seen-at storage

**Files:**
- Create: `lib/student/notifications.js`
- Test: `tests/student/notifications.test.js`

**Interfaces:**
- Consumes: `db.meta` from `lib/offline/db.js`.
- Produces:
  - `unreadCount(grants, seenAt)` → number of grants with `created_at > seenAt`
    (all of them when `seenAt` is null/undefined). `grants` is
    `Array<{ created_at: string }>`.
  - `seenKey(studentId)` → `notif_seen|<studentId>`.
  - `getSeenAt(studentId)` → `Promise<string|null>` from `db.meta`.
  - `markSeen(studentId, whenIso)` → `Promise<void>` writing `db.meta`.

- [ ] **Step 1: Write the failing test (pure logic only)**

```js
// tests/student/notifications.test.js
import { describe, it, expect } from 'vitest';
import { unreadCount, seenKey } from '@/lib/student/notifications';

const grants = [
  { created_at: '2026-08-08T10:00:00Z' },
  { created_at: '2026-08-08T09:00:00Z' },
  { created_at: '2026-08-07T09:00:00Z' },
];

describe('unreadCount', () => {
  it('counts everything when nothing has been seen', () => {
    expect(unreadCount(grants, null)).toBe(3);
  });

  it('counts only grants newer than the seen timestamp', () => {
    expect(unreadCount(grants, '2026-08-08T09:30:00Z')).toBe(1);
  });

  it('is zero when the newest grant is already seen', () => {
    expect(unreadCount(grants, '2026-08-08T10:00:00Z')).toBe(0);
  });

  it('handles an empty feed', () => {
    expect(unreadCount([], null)).toBe(0);
  });
});

describe('seenKey', () => {
  it('namespaces by student id', () => {
    expect(seenKey('abc')).toBe('notif_seen|abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student/notifications.test.js`
Expected: FAIL — cannot resolve `@/lib/student/notifications`.

- [ ] **Step 3: Implement**

```js
// lib/student/notifications.js
import { db } from '@/lib/offline/db';

export const seenKey = (studentId) => `notif_seen|${studentId}`;

/** How many grants arrived after the student last opened the tab. */
export function unreadCount(grants, seenAt) {
  if (!seenAt) return grants.length;
  const cut = new Date(seenAt).getTime();
  return grants.reduce((n, g) => (new Date(g.created_at).getTime() > cut ? n + 1 : n), 0);
}

export async function getSeenAt(studentId) {
  const row = await db.meta.get(seenKey(studentId));
  return row?.value ?? null;
}

export async function markSeen(studentId, whenIso = new Date().toISOString()) {
  await db.meta.put({ key: seenKey(studentId), value: whenIso });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/student/notifications.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/student/notifications.js tests/student/notifications.test.js
git commit -m "feat: student notification unread logic and seen-at store"
```

---

### Task 8: Unread badge hook

**Files:**
- Create: `lib/student/useUnreadNotifications.js`

**Interfaces:**
- Consumes: `useStudentContext`, `getBrowserClient`, `fetchStudentGrants`
  (`lib/boards/queries.js`), `unreadCount`, `getSeenAt` (Task 7).
- Produces: `useUnreadNotifications()` → `{ count, refresh }`. `count` is the
  unread number (0 while loading / offline / no student).

- [ ] **Step 1: Implement the hook**

```js
// lib/student/useUnreadNotifications.js
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { unreadCount, getSeenAt } from '@/lib/student/notifications';
import { useStudentContext } from '@/lib/student/useStudentContext';

export function useUnreadNotifications() {
  const ctx = useStudentContext();
  const studentId = ctx.student?.id;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!studentId || !navigator.onLine) return;
    try {
      const [grants, seenAt] = await Promise.all([
        fetchStudentGrants(getBrowserClient(), { studentId }),
        getSeenAt(studentId),
      ]);
      setCount(unreadCount(grants, seenAt));
    } catch {
      /* a badge is not worth surfacing an error for */
    }
  }, [studentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
```

- [ ] **Step 2: Commit** (no separate test — the logic it composes is covered by Task 7)

```bash
git add lib/student/useUnreadNotifications.js
git commit -m "feat: student unread notifications hook"
```

---

### Task 9: Notifications screen + nav tab

**Files:**
- Create: `app/(student)/notifications/page.js`
- Create: `app/(student)/notifications/NotificationsScreen.js`
- Modify: `components/student/StudentNav.js`

**Interfaces:**
- Consumes: `useStudentContext`, `getBrowserClient`, `fetchStudentGrants`,
  `markSeen` (Task 7), `useUnreadNotifications` (Task 8).

- [ ] **Step 1: Create the page wrapper**

Mirror `app/(student)/board/page.js` for structure/metadata. Minimal version:

```js
// app/(student)/notifications/page.js
import { NotificationsScreen } from './NotificationsScreen';

export const metadata = { title: 'التنبيهات' };

export default function Page() {
  return <NotificationsScreen />;
}
```

(If `board/page.js` adds `export const dynamic` or a layout heading, match it.)

- [ ] **Step 2: Create the screen**

```js
// app/(student)/notifications/NotificationsScreen.js
'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { markSeen } from '@/lib/student/notifications';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { formatDayArabic } from '@/lib/schedule-time/day';

export function NotificationsScreen() {
  const ctx = useStudentContext();
  const studentId = ctx.student?.id;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!studentId) return undefined;
    let alive = true;
    fetchStudentGrants(getBrowserClient(), { studentId }).then((data) => {
      if (!alive) return;
      setRows(data);
      // Opening the tab clears the badge.
      markSeen(studentId);
    });
    return () => {
      alive = false;
    };
  }, [studentId]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <h1 className="text-lg font-bold text-brand">التنبيهات</h1>

      {rows === null ? (
        <p className="text-sm text-muted">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">
          لا توجد تنبيهات بعد. ستظهر هنا نقاط المشرفين ومنها سبب كل تقييم.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.id} className="card flex flex-wrap items-center gap-2 p-4 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{g.criteria?.name ?? 'تقييم'}</span>
                {g.note && <span className="block break-words text-xs text-muted">{g.note}</span>}
                <span className="mt-0.5 block text-xs text-muted">
                  {formatDayArabic(String(g.created_at).slice(0, 10))}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
                  Number(g.points) < 0 ? 'bg-danger-soft text-danger-ink' : 'bg-ok text-ok-ink'
                }`}
                dir="ltr"
              >
                {Number(g.points) > 0 ? '+' : ''}
                {Number(g.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the nav tab with a badge**

In `components/student/StudentNav.js`, add the item and the hook. Add to `ITEMS`:

```js
{ href: '/notifications', label: 'التنبيهات', icon: '🔔', badge: true },
```

Import and call the hook inside `StudentNav`:

```js
import { useUnreadNotifications } from '@/lib/student/useUnreadNotifications';
// ...
const { count } = useUnreadNotifications();
```

In the `items.map(...)` render, add a badge when `item.badge && count > 0`. Wrap the icon span:

```jsx
<span className="relative text-lg leading-none" aria-hidden="true">
  {item.icon}
  {item.badge && count > 0 && (
    <span className="absolute -end-2 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
      {count > 9 ? '9+' : count}
    </span>
  )}
</span>
```

(The notifications tab has no `needsBoard` filter, so it always shows.)

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. As an admin grant points to a student; log in as that student → the 🔔 tab shows a badge with the count; opening التنبيهات lists the grant with its note and sign; navigating away and back shows no badge (seen). Deduct points → shows red with a minus.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
git add app/(student)/notifications/page.js app/(student)/notifications/NotificationsScreen.js components/student/StudentNav.js
git commit -m "feat: student notifications tab with unread badge"
```

---

## Self-Review Notes (author)

- **Spec coverage:** F1 → Tasks 1–4; F2 → Tasks 5–6; F3 → Tasks 7–9. F4 (push) intentionally not planned — scoped for later per the spec.
- **Type consistency:** `summarizeGrants` outcome shape (`{ studentId, id, error }`) matches its use in Task 3. `buildGroupRows`/`UNGROUPED` names match Task 6 imports. `unreadCount/getSeenAt/markSeen/seenKey` names match Tasks 8–9. `fetchStudentGrants` returns rows with `id, points, note, created_at, criteria(name)` — used by the screen and hook.
- **Verify-at-execution:** the `requireStaff` mock shape in Task 3 (`{ db, scoped, profile }`) and the `board/page.js` structure in Task 9 should be confirmed against the live files while implementing; both are flagged in-step.
```
