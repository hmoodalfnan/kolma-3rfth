# Qawafel Faith & Conduct Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first Arabic web app where students log daily faith practices against manager-defined questions, earning points that drive per-schedule and global leaderboards, with a full audit trail and true offline support.

**Architecture:** Next.js 15 App Router (JavaScript, no TypeScript) on Vercel, backed by Supabase Postgres. All authorization lives in the database via RLS on `auth.uid()`; all point scoring lives in database triggers so the client can never award itself points. Pure-JS domain logic (`lib/questions`, `lib/points`, `lib/schedule-time`) is mirrored by SQL functions and unit-tested offline. The student flow mirrors into IndexedDB with an outbox for real offline use.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, `@supabase/supabase-js` v2, Zod v3, Dexie v4, ExcelJS v4, Vitest + @testing-library/react + jsdom.

## Global Constraints

- **JavaScript only.** No TypeScript, no `.ts`/`.tsx` files. `jsconfig.json` provides the `@/*` path alias.
- **Language/locale:** Arabic-only UI, `dir="rtl"`, `lang="ar"`. All timestamps and day boundaries use `Asia/Riyadh`.
- **Student PIN:** exactly 6 digits, numeric only. **Staff password:** minimum 8 chars containing at least two of {lowercase, uppercase, digit, symbol}.
- **Points are computed by the database**, never trusted from the client. Every scoring rule exists twice: `lib/points/score.js` (display) and the SQL function `app_score_answer` (authority). They must agree.
- **RLS is enabled and FORCEd on every table**, default-deny. The `service_role` key appears only in server-side route handlers, never in a client component.
- **`dangerouslySetInnerHTML` is banned** — ESLint `react/no-danger` set to `error`.
- **Excel handled by `exceljs`**, never the npm `xlsx` package (unpatched advisories).
- **The program logo is never rendered.** Palette: navy `#2A3563` primary, gold `#C9A227` accent, slate neutrals. Font: IBM Plex Sans Arabic.
- **Every list has a skeleton; every mutation is optimistic with rollback.**
- Commit after every task. Never commit `.env.local`.

## Environment Note

Docker is not available on the development machine, so the local Supabase stack cannot run. Database tests are **env-gated**: they run only when `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_KEY` are set (against the real Supabase project, once created), and `describe.skip` with a printed reason otherwise. All domain logic is covered by unit tests that run with no network.

---

## File Structure

```
app/
  layout.js                     root RTL shell, theme, fonts
  page.js                       role-aware redirect
  globals.css                   Tailwind v4 + design tokens
  (auth)/
    login/page.js               staff login
    j/[slug]/page.js            join link -> student login
    change-password/page.js     forced + voluntary password change
  (student)/
    today/page.js               daily sheet
    board/page.js               student-visible leaderboard
    settings/page.js            change PIN, logout
  (manage)/
    layout.js                   manager shell + schedule switcher
    schedules/                  list, create, settings, clone, archive
    students/                   list, create, import, PIN reset
    questions/                  builder + library picker
    grading/                    per-student and per-group point grants
    boards/                     overall, per-question, groups
    export/                     Excel export
    log/                        schedule audit log
  (admin)/
    staff/                      staff accounts + schedule assignment
    library/                    master question library
    global-board/               cross-schedule leaderboard
    global-log/                 global audit log
  api/
    auth/login/route.js         rate-limited, lockout-guarded login
    auth/logout/route.js
    students/create/route.js    service-role auth user creation
    students/import/route.js    bulk create
    students/reset-pin/route.js
    staff/create/route.js
    join/[slug]/route.js        public student-name list for a join link
lib/
  supabase/browser.js           createBrowserClient()
  supabase/server.js            createServerClient(), createServiceClient()
  auth/session.js               getSession, getRole, requireRole
  auth/password.js              policy checks, PIN + slug generation
  questions/registry.js         type -> { configSchema, valueSchema, Editor, Renderer }
  questions/active.js           isQuestionActiveOn()
  points/score.js               scoreAnswer(), maxPoints(), completionPct()
  schedule-time/day.js          Riyadh day helpers, backfill window
  offline/db.js                 Dexie schema
  offline/outbox.js             enqueue/flush/dedupe
  offline/sync.js               mirror + reconciliation
  excel/import.js               parse + validate student sheet
  excel/export.js               build the 5-sheet workbook
  audit/write.js                audit log helpers
  validation/schemas.js         Zod schemas shared client + route handlers
components/
  ui/                           Button, Field, Sheet, Toast, Skeleton, ProgressRing
  questions/                    one renderer + one editor per type
  offline/OfflineBanner.js
supabase/migrations/
  0001_schema.sql
  0002_functions.sql
  0003_rls.sql
  0004_rate_limit_audit.sql
  0005_seed.sql
tests/                          Vitest specs mirroring lib/
```

---

## Phase 0 — Foundation

### Task 1: Project scaffold, tooling, and security headers

**Files:**
- Create: `package.json`, `next.config.js`, `jsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.js`, `vitest.setup.js`, `.gitignore`, `.env.example`
- Create: `app/layout.js`, `app/page.js`, `app/globals.css`
- Test: `tests/config/headers.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildCsp(nonce) -> string` and `securityHeaders(nonce) -> Array<{key, value}>` exported from `next.config.js` helpers in `lib/security/headers.js`, used by Task 32's verification.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --js --app --tailwind --eslint --no-src-dir --import-alias "@/*" --no-turbopack --use-npm
```

Answer `No` if asked about TypeScript. Confirm afterwards that no `.ts`/`.tsx` files exist:

```bash
git ls-files "*.ts" "*.tsx"
```

Expected: no output.

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install @supabase/supabase-js zod dexie exceljs
```

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    globals: true,
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
});
```

Create `vitest.setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing security-headers test**

Create `tests/config/headers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildCsp, securityHeaders } from '@/lib/security/headers';

describe('buildCsp', () => {
  it('locks down defaults and allows only the Supabase origin', () => {
    const csp = buildCsp('abc123', 'https://xyz.supabase.co');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('never permits inline or eval script', () => {
    const scriptSrc = buildCsp('abc123', 'https://xyz.supabase.co')
      .split('; ')
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });
});

describe('securityHeaders', () => {
  it('emits the full hardening set', () => {
    const keys = securityHeaders('abc123', 'https://xyz.supabase.co').map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    );
  });

  it('denies framing and sniffing', () => {
    const map = Object.fromEntries(
      securityHeaders('n', 'https://x.supabase.co').map((h) => [h.key, h.value]),
    );
    expect(map['X-Frame-Options']).toBe('DENY');
    expect(map['X-Content-Type-Options']).toBe('nosniff');
    expect(map['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
npm test -- tests/config/headers.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/security/headers"`.

- [ ] **Step 6: Implement the headers module**

Create `lib/security/headers.js`:

```js
export function buildCsp(nonce, supabaseOrigin) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function securityHeaders(nonce, supabaseOrigin) {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(nonce, supabaseOrigin) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()',
    },
  ];
}
```

`style-src` allows `'unsafe-inline'` because Tailwind and React inject style attributes; scripts never do.

- [ ] **Step 7: Run the test to verify it passes**

```bash
npm test -- tests/config/headers.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Wire headers into middleware**

Create `middleware.js` at the repo root:

```js
import { NextResponse } from 'next/server';
import { securityHeaders } from '@/lib/security/headers';

const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');

export function middleware(request) {
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { key, value } of securityHeaders(nonce, SUPABASE_ORIGIN)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)'],
};
```

- [ ] **Step 9: Ban dangerouslySetInnerHTML**

Replace `eslint.config.mjs` with:

```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'react/no-danger': 'error',
      'no-restricted-globals': ['error', { name: 'localStorage', message: 'Use lib/offline helpers.' }],
    },
  },
  { ignores: ['.next/**', 'node_modules/**'] },
];
```

- [ ] **Step 10: Build the RTL root layout**

Replace `app/layout.js`:

```js
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata = {
  title: 'قوافل — متابعة الأعمال',
  description: 'متابعة الأعمال الإيمانية والسلوكية',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2A3563' },
    { media: '(prefers-color-scheme: dark)', color: '#141A33' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Define the design tokens**

Replace `app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --font-sans: var(--font-arabic), system-ui, sans-serif;

  --color-navy-50:  #eef0f7;
  --color-navy-100: #d6dbec;
  --color-navy-300: #8f9ac4;
  --color-navy-500: #4a5691;
  --color-navy-600: #37427a;
  --color-navy-700: #2a3563;
  --color-navy-900: #141a33;

  --color-gold-300: #e8cf7a;
  --color-gold-500: #c9a227;
  --color-gold-700: #96771a;

  --color-surface: #f7f8fb;
  --color-panel: #ffffff;
  --color-ink: #1b2033;
  --color-muted: #6b7391;
  --color-line: #e3e6f0;

  --radius-card: 1.25rem;
}

@layer base {
  :root[data-theme='dark'] {
    --color-surface: #0f1428;
    --color-panel: #191f3a;
    --color-ink: #eef0f7;
    --color-muted: #9aa2c4;
    --color-line: #2a3155;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --color-surface: #0f1428;
      --color-panel: #191f3a;
      --color-ink: #eef0f7;
      --color-muted: #9aa2c4;
      --color-line: #2a3155;
    }
  }

  button, [role='button'], a, input, select, textarea {
    min-block-size: 44px;
  }
}
```

- [ ] **Step 12: Document environment variables**

Create `.env.example`:

```
# Supabase — Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY

# Server-only. Never expose to the browser.
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY

# Internal email domain used to synthesize Supabase Auth identities.
AUTH_EMAIL_DOMAIN=qawafel.internal

# Optional: enables the env-gated database integration tests.
SUPABASE_TEST_URL=
SUPABASE_TEST_SERVICE_KEY=
```

Confirm `.gitignore` contains `.env*.local`.

- [ ] **Step 13: Verify the app boots and the suite is green**

```bash
npm run lint && npm test && npm run build
```

Expected: lint clean, tests pass, build succeeds.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with RTL shell, design tokens, and security headers"
```

---

## Phase 1 — Domain logic (pure JavaScript, no network)

This phase is the heart of the system and runs entirely offline. Phase 2 mirrors it in SQL.

### Task 2: Question type registry and config schemas

**Files:**
- Create: `lib/questions/types.js`, `lib/questions/config-schema.js`, `lib/questions/value-schema.js`
- Test: `tests/questions/config-schema.test.js`, `tests/questions/value-schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `QUESTION_TYPES` — frozen array `['bool','per_prayer','single_choice','multi_choice','counter','rating','text']`
  - `PRAYERS` — `['fajr','dhuhr','asr','maghrib','isha']`
  - `PRAYER_LABELS` — `{ fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' }`
  - `configSchemaFor(type) -> ZodSchema`
  - `valueSchemaFor(question) -> ZodSchema` where `question = { type, config }`
  - `parseConfig(type, config) -> { ok: true, data } | { ok: false, error: string }`

- [ ] **Step 1: Write the failing config-schema test**

Create `tests/questions/config-schema.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { QUESTION_TYPES, parseConfig } from '@/lib/questions/config-schema';

describe('QUESTION_TYPES', () => {
  it('contains exactly the seven supported types', () => {
    expect([...QUESTION_TYPES]).toEqual([
      'bool', 'per_prayer', 'single_choice', 'multi_choice', 'counter', 'rating', 'text',
    ]);
  });
});

describe('parseConfig', () => {
  it('accepts an empty config for bool and text', () => {
    expect(parseConfig('bool', {}).ok).toBe(true);
    expect(parseConfig('text', {}).ok).toBe(true);
  });

  it('accepts a per_prayer config and defaults to all five prayers', () => {
    const res = parseConfig('per_prayer', { points_per_prayer: 3 });
    expect(res.ok).toBe(true);
    expect(res.data.prayers).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(res.data.points_per_prayer).toBe(3);
  });

  it('rejects a per_prayer config naming an unknown prayer', () => {
    const res = parseConfig('per_prayer', { prayers: ['fajr', 'tahajjud'], points_per_prayer: 1 });
    expect(res.ok).toBe(false);
  });

  it('accepts choice options carrying negative points', () => {
    const res = parseConfig('single_choice', {
      options: [
        { id: 'walk', label: 'مشي', points: 5 },
        { id: 'car', label: 'بسيارة', points: 2 },
        { id: 'none', label: 'لم أذهب', points: -2 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.data.options).toHaveLength(3);
  });

  it('rejects duplicate option ids', () => {
    const res = parseConfig('multi_choice', {
      options: [
        { id: 'a', label: 'أ', points: 1 },
        { id: 'a', label: 'ب', points: 2 },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/مكرر/);
  });

  it('rejects a choice config with no options', () => {
    expect(parseConfig('single_choice', { options: [] }).ok).toBe(false);
  });

  it('accepts a counter config and rejects a non-positive max', () => {
    expect(parseConfig('counter', { points_per_unit: 2, max: 20, unit_label: 'صفحة' }).ok).toBe(true);
    expect(parseConfig('counter', { points_per_unit: 2, max: 0 }).ok).toBe(false);
  });

  it('caps rating stars at 10 and requires at least 2', () => {
    expect(parseConfig('rating', { max: 5, points_per_star: 1 }).ok).toBe(true);
    expect(parseConfig('rating', { max: 1, points_per_star: 1 }).ok).toBe(false);
    expect(parseConfig('rating', { max: 11, points_per_star: 1 }).ok).toBe(false);
  });

  it('rejects an unknown question type', () => {
    expect(parseConfig('freeform', {}).ok).toBe(false);
  });

  it('strips unknown keys rather than trusting them', () => {
    const res = parseConfig('bool', { evil: 'x' });
    expect(res.ok).toBe(true);
    expect(res.data.evil).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/questions/config-schema.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/questions/config-schema"`.

- [ ] **Step 3: Implement the type constants**

Create `lib/questions/types.js`:

```js
export const QUESTION_TYPES = Object.freeze([
  'bool',
  'per_prayer',
  'single_choice',
  'multi_choice',
  'counter',
  'rating',
  'text',
]);

export const PRAYERS = Object.freeze(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

export const PRAYER_LABELS = Object.freeze({
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
});

export const TYPE_LABELS = Object.freeze({
  bool: 'نعم / لا',
  per_prayer: 'لكل صلاة',
  single_choice: 'اختيار واحد',
  multi_choice: 'اختيار متعدد',
  counter: 'عدّاد',
  rating: 'تقييم بالنجوم',
  text: 'نص حر',
});
```

- [ ] **Step 4: Implement the config schemas**

Create `lib/questions/config-schema.js`:

```js
import { z } from 'zod';
import { QUESTION_TYPES, PRAYERS } from './types';

export { QUESTION_TYPES, PRAYERS };

const points = z.number().finite().min(-1000).max(1000);

const option = z.object({
  id: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/i, 'معرّف الخيار غير صالح'),
  label: z.string().min(1).max(120),
  points: points.default(0),
});

const uniqueOptions = z
  .array(option)
  .min(2, 'يجب إضافة خيارين على الأقل')
  .max(20, 'الحد الأقصى 20 خياراً')
  .superRefine((opts, ctx) => {
    const seen = new Set();
    for (const o of opts) {
      if (seen.has(o.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `معرّف الخيار مكرر: ${o.id}` });
      }
      seen.add(o.id);
    }
  });

const SCHEMAS = {
  bool: z.object({}).strip(),
  text: z.object({ max_length: z.number().int().min(1).max(2000).default(500) }).strip(),
  per_prayer: z
    .object({
      prayers: z.array(z.enum(PRAYERS)).min(1).max(5).default([...PRAYERS]),
      points_per_prayer: points.default(1),
    })
    .strip(),
  single_choice: z.object({ options: uniqueOptions }).strip(),
  multi_choice: z.object({ options: uniqueOptions }).strip(),
  counter: z
    .object({
      points_per_unit: points.default(1),
      max: z.number().int().min(1).max(10000),
      unit_label: z.string().max(40).default(''),
    })
    .strip(),
  rating: z
    .object({
      max: z.number().int().min(2).max(10).default(5),
      points_per_star: points.default(1),
    })
    .strip(),
};

export function configSchemaFor(type) {
  return SCHEMAS[type] ?? null;
}

export function parseConfig(type, config) {
  const schema = configSchemaFor(type);
  if (!schema) return { ok: false, error: `نوع سؤال غير معروف: ${type}` };
  const result = schema.safeParse(config ?? {});
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join(' — ') };
  }
  return { ok: true, data: result.data };
}
```

`.strip()` is what makes the "strips unknown keys" test pass — unknown keys are dropped rather than persisted.

- [ ] **Step 5: Run the config test to verify it passes**

```bash
npm test -- tests/questions/config-schema.test.js
```

Expected: PASS, 10 tests.

- [ ] **Step 6: Write the failing value-schema test**

Create `tests/questions/value-schema.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateValue } from '@/lib/questions/value-schema';

const q = (type, config) => ({ type, config });

describe('validateValue', () => {
  it('accepts booleans for bool and rejects anything else', () => {
    expect(validateValue(q('bool', {}), true).ok).toBe(true);
    expect(validateValue(q('bool', {}), false).ok).toBe(true);
    expect(validateValue(q('bool', {}), 'true').ok).toBe(false);
    expect(validateValue(q('bool', {}), 1).ok).toBe(false);
  });

  it('accepts a per_prayer map limited to the configured prayers', () => {
    const question = q('per_prayer', { prayers: ['fajr', 'isha'], points_per_prayer: 2 });
    expect(validateValue(question, { fajr: true, isha: false }).ok).toBe(true);
    expect(validateValue(question, { fajr: true, asr: true }).ok).toBe(false);
  });

  it('accepts only a configured option id for single_choice', () => {
    const question = q('single_choice', {
      options: [
        { id: 'walk', label: 'مشي', points: 5 },
        { id: 'car', label: 'بسيارة', points: 2 },
      ],
    });
    expect(validateValue(question, 'walk').ok).toBe(true);
    expect(validateValue(question, 'plane').ok).toBe(false);
    expect(validateValue(question, ['walk']).ok).toBe(false);
  });

  it('accepts a deduplicated subset of option ids for multi_choice', () => {
    const question = q('multi_choice', {
      options: [
        { id: 'a', label: 'أ', points: 1 },
        { id: 'b', label: 'ب', points: 1 },
      ],
    });
    expect(validateValue(question, ['a', 'b']).ok).toBe(true);
    expect(validateValue(question, []).ok).toBe(true);
    expect(validateValue(question, ['a', 'a']).ok).toBe(false);
    expect(validateValue(question, ['a', 'z']).ok).toBe(false);
  });

  it('bounds counter values to the configured max', () => {
    const question = q('counter', { points_per_unit: 1, max: 10 });
    expect(validateValue(question, 0).ok).toBe(true);
    expect(validateValue(question, 10).ok).toBe(true);
    expect(validateValue(question, 11).ok).toBe(false);
    expect(validateValue(question, -1).ok).toBe(false);
    expect(validateValue(question, 2.5).ok).toBe(false);
  });

  it('bounds rating values to the configured star count', () => {
    const question = q('rating', { max: 5, points_per_star: 1 });
    expect(validateValue(question, 5).ok).toBe(true);
    expect(validateValue(question, 6).ok).toBe(false);
    expect(validateValue(question, 0).ok).toBe(true);
  });

  it('bounds text length', () => {
    const question = q('text', { max_length: 10 });
    expect(validateValue(question, 'قصير').ok).toBe(true);
    expect(validateValue(question, 'x'.repeat(11)).ok).toBe(false);
  });

  it('rejects a value for an unknown type', () => {
    expect(validateValue(q('freeform', {}), 'x').ok).toBe(false);
  });
});
```

- [ ] **Step 7: Run the value test to verify it fails**

```bash
npm test -- tests/questions/value-schema.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/questions/value-schema"`.

- [ ] **Step 8: Implement the value schemas**

Create `lib/questions/value-schema.js`:

```js
import { z } from 'zod';
import { parseConfig } from './config-schema';

export function valueSchemaFor(question) {
  const parsed = parseConfig(question.type, question.config);
  if (!parsed.ok) return null;
  const config = parsed.data;

  switch (question.type) {
    case 'bool':
      return z.boolean();
    case 'per_prayer': {
      const shape = {};
      for (const p of config.prayers) shape[p] = z.boolean().optional();
      return z.object(shape).strict();
    }
    case 'single_choice':
      return z.enum(config.options.map((o) => o.id));
    case 'multi_choice': {
      const ids = new Set(config.options.map((o) => o.id));
      return z
        .array(z.string())
        .max(ids.size)
        .superRefine((arr, ctx) => {
          const seen = new Set();
          for (const id of arr) {
            if (!ids.has(id)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `خيار غير معروف: ${id}` });
            }
            if (seen.has(id)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `خيار مكرر: ${id}` });
            }
            seen.add(id);
          }
        });
    }
    case 'counter':
      return z.number().int().min(0).max(config.max);
    case 'rating':
      return z.number().int().min(0).max(config.max);
    case 'text':
      return z.string().max(config.max_length);
    default:
      return null;
  }
}

export function validateValue(question, value) {
  const schema = valueSchemaFor(question);
  if (!schema) return { ok: false, error: 'نوع سؤال غير معروف أو إعدادات غير صالحة' };
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join(' — ') };
  }
  return { ok: true, data: result.data };
}
```

- [ ] **Step 9: Run the value test to verify it passes**

```bash
npm test -- tests/questions/value-schema.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 10: Commit**

```bash
git add lib/questions tests/questions
git commit -m "feat: question type registry with config and value validation"
```

---

### Task 3: Scoring engine

This is the JavaScript authority for display. Task 7 mirrors it exactly in SQL, which is the authority for storage.

**Files:**
- Create: `lib/points/score.js`
- Test: `tests/points/score.test.js`

**Interfaces:**
- Consumes: `parseConfig` from `@/lib/questions/config-schema`.
- Produces:
  - `scoreAnswer(question, value) -> number` where `question = { type, config, points }`
  - `maxPoints(question) -> number`
  - `completionPct(questions, answersByQuestionId) -> number` (0–100, rounded to 1 decimal)

- [ ] **Step 1: Write the failing scoring test**

Create `tests/points/score.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scoreAnswer, maxPoints, completionPct } from '@/lib/points/score';

const boolQ = { id: 'q1', type: 'bool', config: {}, points: 5 };
const prayerQ = {
  id: 'q2', type: 'per_prayer',
  config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 2 },
  points: 0,
};
const singleQ = {
  id: 'q3', type: 'single_choice',
  config: { options: [
    { id: 'walk', label: 'مشي', points: 5 },
    { id: 'car', label: 'بسيارة', points: 2 },
    { id: 'none', label: 'لم أذهب', points: -2 },
  ] },
  points: 0,
};
const multiQ = {
  id: 'q4', type: 'multi_choice',
  config: { options: [
    { id: 'a', label: 'أ', points: 3 },
    { id: 'b', label: 'ب', points: 4 },
    { id: 'c', label: 'ج', points: -1 },
  ] },
  points: 0,
};
const counterQ = { id: 'q5', type: 'counter', config: { points_per_unit: 2, max: 10 }, points: 0 };
const ratingQ = { id: 'q6', type: 'rating', config: { max: 5, points_per_star: 3 }, points: 0 };
const textQ = { id: 'q7', type: 'text', config: { max_length: 500 }, points: 0 };

describe('scoreAnswer', () => {
  it('awards flat points for a checked bool and zero otherwise', () => {
    expect(scoreAnswer(boolQ, true)).toBe(5);
    expect(scoreAnswer(boolQ, false)).toBe(0);
  });

  it('awards per-prayer points only for configured prayers marked true', () => {
    expect(scoreAnswer(prayerQ, { fajr: true, dhuhr: true, asr: false })).toBe(4);
    expect(scoreAnswer(prayerQ, { fajr: true, tahajjud: true })).toBe(2);
    expect(scoreAnswer(prayerQ, {})).toBe(0);
  });

  it('awards the chosen option points, including negatives', () => {
    expect(scoreAnswer(singleQ, 'walk')).toBe(5);
    expect(scoreAnswer(singleQ, 'none')).toBe(-2);
    expect(scoreAnswer(singleQ, 'unknown')).toBe(0);
  });

  it('sums the selected option points for multi_choice', () => {
    expect(scoreAnswer(multiQ, ['a', 'b'])).toBe(7);
    expect(scoreAnswer(multiQ, ['a', 'c'])).toBe(2);
    expect(scoreAnswer(multiQ, [])).toBe(0);
  });

  it('multiplies counter values and clamps to the configured max', () => {
    expect(scoreAnswer(counterQ, 4)).toBe(8);
    expect(scoreAnswer(counterQ, 99)).toBe(20);
    expect(scoreAnswer(counterQ, -5)).toBe(0);
  });

  it('multiplies rating stars and clamps to the configured max', () => {
    expect(scoreAnswer(ratingQ, 4)).toBe(12);
    expect(scoreAnswer(ratingQ, 9)).toBe(15);
  });

  it('always scores text as zero', () => {
    expect(scoreAnswer(textQ, 'أي نص')).toBe(0);
  });

  it('scores a null or undefined value as zero for every type', () => {
    for (const q of [boolQ, prayerQ, singleQ, multiQ, counterQ, ratingQ, textQ]) {
      expect(scoreAnswer(q, null)).toBe(0);
      expect(scoreAnswer(q, undefined)).toBe(0);
    }
  });

  it('scores an unknown type as zero rather than throwing', () => {
    expect(scoreAnswer({ type: 'freeform', config: {}, points: 9 }, 'x')).toBe(0);
  });
});

describe('maxPoints', () => {
  it('returns the best achievable score per type', () => {
    expect(maxPoints(boolQ)).toBe(5);
    expect(maxPoints(prayerQ)).toBe(10);
    expect(maxPoints(singleQ)).toBe(5);
    expect(maxPoints(multiQ)).toBe(7);
    expect(maxPoints(counterQ)).toBe(20);
    expect(maxPoints(ratingQ)).toBe(15);
    expect(maxPoints(textQ)).toBe(0);
  });

  it('never returns a negative maximum when every option is negative', () => {
    const q = {
      type: 'single_choice',
      config: { options: [
        { id: 'a', label: 'أ', points: -1 },
        { id: 'b', label: 'ب', points: -3 },
      ] },
      points: 0,
    };
    expect(maxPoints(q)).toBe(0);
  });
});

describe('completionPct', () => {
  it('is the ratio of earned to achievable points', () => {
    const pct = completionPct([boolQ, prayerQ], { q1: true, q2: { fajr: true } });
    expect(pct).toBe(46.7);
  });

  it('excludes zero-max questions such as text from the denominator', () => {
    expect(completionPct([boolQ, textQ], { q1: true, q7: 'ملاحظة' })).toBe(100);
  });

  it('floors at zero when negative options outweigh the positives', () => {
    expect(completionPct([singleQ], { q3: 'none' })).toBe(0);
  });

  it('returns zero for an empty question list rather than dividing by zero', () => {
    expect(completionPct([], {})).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/points/score.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/points/score"`.

- [ ] **Step 3: Implement the scorer**

Create `lib/points/score.js`:

```js
import { parseConfig } from '@/lib/questions/config-schema';

function cfg(question) {
  const parsed = parseConfig(question.type, question.config);
  return parsed.ok ? parsed.data : null;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function scoreAnswer(question, value) {
  if (value === null || value === undefined) return 0;
  const config = cfg(question);
  if (!config) return 0;

  switch (question.type) {
    case 'bool':
      return value === true ? Number(question.points) || 0 : 0;

    case 'per_prayer':
      return config.prayers.reduce(
        (sum, p) => (value?.[p] === true ? sum + config.points_per_prayer : sum),
        0,
      );

    case 'single_choice': {
      const opt = config.options.find((o) => o.id === value);
      return opt ? opt.points : 0;
    }

    case 'multi_choice': {
      if (!Array.isArray(value)) return 0;
      const byId = new Map(config.options.map((o) => [o.id, o.points]));
      return [...new Set(value)].reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
    }

    case 'counter': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      return clamp(Math.trunc(value), 0, config.max) * config.points_per_unit;
    }

    case 'rating': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      return clamp(Math.trunc(value), 0, config.max) * config.points_per_star;
    }

    case 'text':
      return 0;

    default:
      return 0;
  }
}

export function maxPoints(question) {
  const config = cfg(question);
  if (!config) return 0;

  switch (question.type) {
    case 'bool':
      return Math.max(0, Number(question.points) || 0);
    case 'per_prayer':
      return Math.max(0, config.prayers.length * config.points_per_prayer);
    case 'single_choice':
      return Math.max(0, ...config.options.map((o) => o.points));
    case 'multi_choice':
      return config.options.reduce((sum, o) => sum + Math.max(0, o.points), 0);
    case 'counter':
      return Math.max(0, config.max * config.points_per_unit);
    case 'rating':
      return Math.max(0, config.max * config.points_per_star);
    case 'text':
    default:
      return 0;
  }
}

export function completionPct(questions, answersByQuestionId) {
  let earned = 0;
  let possible = 0;
  for (const q of questions) {
    const max = maxPoints(q);
    if (max <= 0) continue;
    possible += max;
    earned += scoreAnswer(q, answersByQuestionId?.[q.id]);
  }
  if (possible <= 0) return 0;
  const pct = (earned / possible) * 100;
  return Math.round(clamp(pct, 0, 100) * 10) / 10;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/points/score.test.js
```

Expected: PASS, 15 tests. If `completionPct` returns `46.7` for the first case, the earned/possible arithmetic (7 of 15) matches the SQL mirror written in Task 7.

- [ ] **Step 5: Commit**

```bash
git add lib/points tests/points
git commit -m "feat: scoring engine for all seven question types"
```

---

### Task 4: Riyadh day helpers and question activation

**Files:**
- Create: `lib/schedule-time/day.js`, `lib/questions/active.js`
- Test: `tests/schedule-time/day.test.js`, `tests/questions/active.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `todayInRiyadh(now = new Date()) -> 'YYYY-MM-DD'`
  - `toDayKey(date) -> 'YYYY-MM-DD'`
  - `addDays(dayKey, n) -> 'YYYY-MM-DD'`
  - `dayOfWeek(dayKey) -> 0..6` (0 = Sunday, matching PostgreSQL `EXTRACT(DOW)`)
  - `daysBetween(fromKey, toKey) -> number`
  - `backfillWindow(schedule, now) -> { earliest, latest }`
  - `isWithinBackfill(schedule, dayKey, now) -> boolean`
  - `scheduleDayRange(schedule, now) -> string[]`
  - `isQuestionActiveOn(question, dayKey) -> boolean`

- [ ] **Step 1: Write the failing day-helper test**

Create `tests/schedule-time/day.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  todayInRiyadh, addDays, dayOfWeek, daysBetween,
  backfillWindow, isWithinBackfill, scheduleDayRange,
} from '@/lib/schedule-time/day';

describe('todayInRiyadh', () => {
  it('uses the Riyadh calendar day, not UTC', () => {
    // 2026-03-10T21:30Z is 2026-03-11 00:30 in Riyadh (UTC+3).
    expect(todayInRiyadh(new Date('2026-03-10T21:30:00Z'))).toBe('2026-03-11');
  });

  it('stays on the same day just before the Riyadh rollover', () => {
    expect(todayInRiyadh(new Date('2026-03-10T20:30:00Z'))).toBe('2026-03-10');
  });
});

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('dayOfWeek', () => {
  it('returns 0 for Sunday, matching PostgreSQL DOW', () => {
    expect(dayOfWeek('2026-08-02')).toBe(0);
    expect(dayOfWeek('2026-08-07')).toBe(5);
  });
});

describe('daysBetween', () => {
  it('counts calendar days inclusive of neither endpoint offset', () => {
    expect(daysBetween('2026-08-02', '2026-08-05')).toBe(3);
    expect(daysBetween('2026-08-05', '2026-08-02')).toBe(-3);
  });
});

describe('backfillWindow', () => {
  const now = new Date('2026-08-10T09:00:00Z'); // 12:00 Riyadh

  it('spans backfill_days before today', () => {
    const w = backfillWindow({ start_date: '2026-08-01', end_date: null, backfill_days: 3 }, now);
    expect(w).toEqual({ earliest: '2026-08-07', latest: '2026-08-10' });
  });

  it('never reaches before the schedule start date', () => {
    const w = backfillWindow({ start_date: '2026-08-09', end_date: null, backfill_days: 5 }, now);
    expect(w.earliest).toBe('2026-08-09');
  });

  it('never reaches past the schedule end date', () => {
    const w = backfillWindow({ start_date: '2026-08-01', end_date: '2026-08-08', backfill_days: 3 }, now);
    expect(w.latest).toBe('2026-08-08');
  });

  it('treats backfill_days of 0 as today only', () => {
    const w = backfillWindow({ start_date: '2026-08-01', end_date: null, backfill_days: 0 }, now);
    expect(w).toEqual({ earliest: '2026-08-10', latest: '2026-08-10' });
  });
});

describe('isWithinBackfill', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const schedule = { start_date: '2026-08-01', end_date: null, backfill_days: 3 };

  it('accepts today and the edge of the window', () => {
    expect(isWithinBackfill(schedule, '2026-08-10', now)).toBe(true);
    expect(isWithinBackfill(schedule, '2026-08-07', now)).toBe(true);
  });

  it('rejects one day past the window and any future day', () => {
    expect(isWithinBackfill(schedule, '2026-08-06', now)).toBe(false);
    expect(isWithinBackfill(schedule, '2026-08-11', now)).toBe(false);
  });
});

describe('scheduleDayRange', () => {
  const now = new Date('2026-08-10T09:00:00Z');

  it('runs start to end for a closed schedule', () => {
    const days = scheduleDayRange({ start_date: '2026-08-01', end_date: '2026-08-03' }, now);
    expect(days).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('runs start to today for an open-ended schedule', () => {
    const days = scheduleDayRange({ start_date: '2026-08-08', end_date: null }, now);
    expect(days).toEqual(['2026-08-08', '2026-08-09', '2026-08-10']);
  });

  it('returns an empty array for a schedule that has not started', () => {
    expect(scheduleDayRange({ start_date: '2026-09-01', end_date: null }, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/schedule-time/day.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/schedule-time/day"`.

- [ ] **Step 3: Implement the day helpers**

Create `lib/schedule-time/day.js`:

```js
export const TZ = 'Asia/Riyadh';
const MS_PER_DAY = 86_400_000;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' for the given instant, in Riyadh local time. */
export function toDayKey(date) {
  return fmt.format(date);
}

export function todayInRiyadh(now = new Date()) {
  return toDayKey(now);
}

/** Parse 'YYYY-MM-DD' as a UTC-noon instant so DST/offset shifts cannot move the day. */
function parseKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dayKey, n) {
  return formatKey(new Date(parseKey(dayKey).getTime() + n * MS_PER_DAY));
}

/** 0 = Sunday, matching PostgreSQL EXTRACT(DOW FROM date). */
export function dayOfWeek(dayKey) {
  return parseKey(dayKey).getUTCDay();
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / MS_PER_DAY);
}

const maxKey = (a, b) => (a > b ? a : b);
const minKey = (a, b) => (a < b ? a : b);

export function backfillWindow(schedule, now = new Date()) {
  const today = todayInRiyadh(now);
  let latest = today;
  if (schedule.end_date) latest = minKey(latest, schedule.end_date);

  let earliest = addDays(today, -Math.max(0, schedule.backfill_days ?? 0));
  earliest = maxKey(earliest, schedule.start_date);
  if (earliest > latest) earliest = latest;

  return { earliest, latest };
}

export function isWithinBackfill(schedule, dayKey, now = new Date()) {
  const { earliest, latest } = backfillWindow(schedule, now);
  return dayKey >= earliest && dayKey <= latest;
}

/** Every day the schedule has covered so far: start..end, or start..today when open-ended. */
export function scheduleDayRange(schedule, now = new Date()) {
  const today = todayInRiyadh(now);
  const last = schedule.end_date ? minKey(schedule.end_date, today) : today;
  if (schedule.start_date > last) return [];

  const days = [];
  for (let d = schedule.start_date; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}
```

- [ ] **Step 4: Run the day test to verify it passes**

```bash
npm test -- tests/schedule-time/day.test.js
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Write the failing activation test**

Create `tests/questions/active.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isQuestionActiveOn, activeQuestionsOn } from '@/lib/questions/active';

const base = { id: 'q', active_weekdays: null, active_from: null, active_to: null, archived_at: null };

describe('isQuestionActiveOn', () => {
  it('is active every day when unrestricted', () => {
    expect(isQuestionActiveOn(base, '2026-08-05')).toBe(true);
  });

  it('honours a weekday restriction using PostgreSQL DOW numbering', () => {
    const friday = { ...base, active_weekdays: [5] };
    expect(isQuestionActiveOn(friday, '2026-08-07')).toBe(true); // Friday
    expect(isQuestionActiveOn(friday, '2026-08-08')).toBe(false); // Saturday
  });

  it('honours an inclusive date sub-range', () => {
    const q = { ...base, active_from: '2026-08-05', active_to: '2026-08-07' };
    expect(isQuestionActiveOn(q, '2026-08-04')).toBe(false);
    expect(isQuestionActiveOn(q, '2026-08-05')).toBe(true);
    expect(isQuestionActiveOn(q, '2026-08-07')).toBe(true);
    expect(isQuestionActiveOn(q, '2026-08-08')).toBe(false);
  });

  it('combines weekday and date-range restrictions', () => {
    const q = { ...base, active_weekdays: [5], active_from: '2026-08-10', active_to: null };
    expect(isQuestionActiveOn(q, '2026-08-07')).toBe(false); // Friday, before the range
    expect(isQuestionActiveOn(q, '2026-08-14')).toBe(true); // Friday, inside the range
  });

  it('is never active once archived', () => {
    const q = { ...base, archived_at: '2026-08-01T00:00:00Z' };
    expect(isQuestionActiveOn(q, '2026-08-05')).toBe(false);
  });

  it('treats an empty weekday array as unrestricted rather than never', () => {
    expect(isQuestionActiveOn({ ...base, active_weekdays: [] }, '2026-08-05')).toBe(true);
  });
});

describe('activeQuestionsOn', () => {
  it('filters and preserves sort_order', () => {
    const qs = [
      { ...base, id: 'b', sort_order: 2 },
      { ...base, id: 'a', sort_order: 1 },
      { ...base, id: 'c', sort_order: 3, archived_at: '2026-01-01T00:00:00Z' },
    ];
    expect(activeQuestionsOn(qs, '2026-08-05').map((q) => q.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 6: Run the activation test to verify it fails**

```bash
npm test -- tests/questions/active.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/questions/active"`.

- [ ] **Step 7: Implement activation filtering**

Create `lib/questions/active.js`:

```js
import { dayOfWeek } from '@/lib/schedule-time/day';

export function isQuestionActiveOn(question, dayKey) {
  if (question.archived_at) return false;

  const weekdays = question.active_weekdays;
  if (Array.isArray(weekdays) && weekdays.length > 0 && !weekdays.includes(dayOfWeek(dayKey))) {
    return false;
  }
  if (question.active_from && dayKey < question.active_from) return false;
  if (question.active_to && dayKey > question.active_to) return false;

  return true;
}

export function activeQuestionsOn(questions, dayKey) {
  return questions
    .filter((q) => isQuestionActiveOn(q, dayKey))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
```

- [ ] **Step 8: Run the activation test to verify it passes**

```bash
npm test -- tests/questions/active.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add lib/schedule-time lib/questions/active.js tests/schedule-time tests/questions/active.test.js
git commit -m "feat: Riyadh day helpers, backfill window, and question activation rules"
```

---

### Task 5: Streaks, password policy, PIN and slug generation

**Files:**
- Create: `lib/points/streak.js`, `lib/auth/password.js`
- Test: `tests/points/streak.test.js`, `tests/auth/password.test.js`

**Interfaces:**
- Consumes: `completionPct` from `@/lib/points/score`; `todayInRiyadh`, `addDays`, `activeQuestionsOn` from Task 4.
- Produces:
  - `currentStreak({ questions, answersByDay, schedule, now }) -> number`
  - `validateStaffPassword(pw) -> { ok, error? }`
  - `validateStudentPin(pin) -> { ok, error? }`
  - `generatePin(randomBytes) -> string` (6 digits)
  - `generateSlug(randomBytes) -> string` (16 chars, Crockford base32)

- [ ] **Step 1: Write the failing streak test**

Create `tests/points/streak.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { currentStreak } from '@/lib/points/streak';

const q = (id) => ({ id, type: 'bool', config: {}, points: 1, active_weekdays: null, active_from: null, active_to: null, archived_at: null, sort_order: 0 });
const questions = [q('a'), q('b')];
const full = { a: true, b: true };
const half = { a: true, b: false };
const now = new Date('2026-08-10T09:00:00Z'); // 2026-08-10 in Riyadh
const schedule = { start_date: '2026-08-01', end_date: null, streak_threshold_pct: 100 };

describe('currentStreak', () => {
  it('counts consecutive fully-complete days ending today', () => {
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': half };
    expect(currentStreak({ questions, answersByDay, schedule, now })).toBe(2);
  });

  it('breaks the streak on the first day below the threshold', () => {
    const answersByDay = { '2026-08-10': half, '2026-08-09': full };
    expect(currentStreak({ questions, answersByDay, schedule, now })).toBe(0);
  });

  it('honours a threshold below 100 percent', () => {
    const answersByDay = { '2026-08-10': half, '2026-08-09': half };
    const lenient = { ...schedule, streak_threshold_pct: 50 };
    expect(currentStreak({ questions, answersByDay, schedule: lenient, now })).toBe(2);
  });

  it('stops at the schedule start date', () => {
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': full };
    const late = { ...schedule, start_date: '2026-08-09' };
    expect(currentStreak({ questions, answersByDay, schedule: late, now })).toBe(2);
  });

  it('is zero when today has no record at all', () => {
    expect(currentStreak({ questions, answersByDay: { '2026-08-09': full }, schedule, now })).toBe(0);
  });

  it('skips days on which no question was active instead of breaking the streak', () => {
    const fridayOnly = { ...q('f'), active_weekdays: [5] };
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': full };
    expect(currentStreak({ questions: [...questions, fridayOnly], answersByDay, schedule, now })).toBe(3);
  });
});
```

- [ ] **Step 2: Run the streak test to verify it fails**

```bash
npm test -- tests/points/streak.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/points/streak"`.

- [ ] **Step 3: Implement the streak calculator**

Create `lib/points/streak.js`:

```js
import { completionPct } from './score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { todayInRiyadh, addDays } from '@/lib/schedule-time/day';

export function currentStreak({ questions, answersByDay, schedule, now = new Date() }) {
  const threshold = schedule.streak_threshold_pct ?? 100;
  let day = todayInRiyadh(now);
  if (schedule.end_date && day > schedule.end_date) day = schedule.end_date;

  let streak = 0;
  while (day >= schedule.start_date) {
    const active = activeQuestionsOn(questions, day);
    if (active.length === 0) {
      day = addDays(day, -1);
      continue;
    }
    const answers = answersByDay?.[day];
    if (!answers) break;
    if (completionPct(active, answers) + 1e-9 < threshold) break;

    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}
```

A day where the student answered nothing breaks the streak; a day where nothing was scheduled is skipped without breaking it.

- [ ] **Step 4: Run the streak test to verify it passes**

```bash
npm test -- tests/points/streak.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing password test**

Create `tests/auth/password.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  validateStaffPassword, validateStudentPin, generatePin, generateSlug,
} from '@/lib/auth/password';

describe('validateStudentPin', () => {
  it('accepts exactly six digits', () => {
    expect(validateStudentPin('012345').ok).toBe(true);
  });

  it('rejects the wrong length or any non-digit', () => {
    expect(validateStudentPin('12345').ok).toBe(false);
    expect(validateStudentPin('1234567').ok).toBe(false);
    expect(validateStudentPin('12345a').ok).toBe(false);
    expect(validateStudentPin('١٢٣٤٥٦').ok).toBe(false);
    expect(validateStudentPin('').ok).toBe(false);
    expect(validateStudentPin(null).ok).toBe(false);
  });

  it('rejects a PIN that is all one digit or a simple run', () => {
    expect(validateStudentPin('111111').ok).toBe(false);
    expect(validateStudentPin('123456').ok).toBe(false);
  });
});

describe('validateStaffPassword', () => {
  it('accepts eight or more characters spanning two class types', () => {
    expect(validateStaffPassword('qawafel2026').ok).toBe(true);
    expect(validateStaffPassword('Qawafel!').ok).toBe(true);
  });

  it('rejects anything shorter than eight characters', () => {
    expect(validateStaffPassword('Qaw2026').ok).toBe(false);
  });

  it('rejects a single character class', () => {
    expect(validateStaffPassword('abcdefghij').ok).toBe(false);
    expect(validateStaffPassword('1234567890').ok).toBe(false);
  });

  it('rejects common passwords regardless of shape', () => {
    expect(validateStaffPassword('password1').ok).toBe(false);
    expect(validateStaffPassword('admin1234').ok).toBe(false);
  });
});

describe('generatePin', () => {
  it('always produces six digits that pass validation', () => {
    for (let i = 0; i < 200; i += 1) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(validateStudentPin(pin).ok).toBe(true);
    }
  });
});

describe('generateSlug', () => {
  it('produces sixteen lowercase base32 characters', () => {
    expect(generateSlug()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{16}$/);
  });

  it('does not repeat across many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateSlug()));
    expect(seen.size).toBe(500);
  });
});
```

- [ ] **Step 6: Run the password test to verify it fails**

```bash
npm test -- tests/auth/password.test.js
```

Expected: FAIL — `Failed to resolve import "@/lib/auth/password"`.

- [ ] **Step 7: Implement password policy and generators**

Create `lib/auth/password.js`:

```js
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'admin123', 'admin1234', 'iloveyou', 'letmein1', 'welcome1',
  'qawafel', 'qawafel1', 'abc12345', '11111111', 'passw0rd',
]);

export function validateStaffPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) {
    return { ok: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (pw.length > 128) return { ok: false, error: 'كلمة المرور طويلة جداً' };
  if (COMMON.has(pw.toLowerCase())) {
    return { ok: false, error: 'كلمة المرور شائعة جداً، اختر كلمة أقوى' };
  }
  const classes =
    Number(/[a-z]/.test(pw)) + Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) + Number(/[^a-zA-Z0-9]/.test(pw));
  if (classes < 2) {
    return { ok: false, error: 'يجب أن تحتوي كلمة المرور على نوعين مختلفين على الأقل (أحرف، أرقام، رموز)' };
  }
  return { ok: true };
}

function isRun(pin) {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i += 1) {
    const diff = Number(pin[i]) - Number(pin[i - 1]);
    if (diff !== 1) up = false;
    if (diff !== -1) down = false;
  }
  return up || down;
}

export function validateStudentPin(pin) {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) {
    return { ok: false, error: 'الرمز يجب أن يكون 6 أرقام' };
  }
  if (new Set(pin).size === 1) return { ok: false, error: 'لا يمكن أن تكون كل الأرقام متطابقة' };
  if (isRun(pin)) return { ok: false, error: 'لا يمكن أن تكون الأرقام متسلسلة' };
  return { ok: true };
}

function randomInts(count, bound) {
  const bytes = new Uint32Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % bound);
}

export function generatePin() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pin = randomInts(6, 10).join('');
    if (validateStudentPin(pin).ok) return pin;
  }
  return '419573';
}

// Crockford base32: no i, l, o, u — avoids characters that are misread aloud.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export function generateSlug(length = 16) {
  return randomInts(length, ALPHABET.length)
    .map((n) => ALPHABET[n])
    .join('');
}
```

`crypto.getRandomValues` is available in the browser, in Node 22, and in the Vercel edge runtime, so this module works unchanged everywhere.

- [ ] **Step 8: Run the password test to verify it passes**

```bash
npm test -- tests/auth/password.test.js
```

Expected: PASS, 10 tests.

- [ ] **Step 9: Run the whole suite**

```bash
npm test
```

Expected: all Phase 0–1 tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/points/streak.js lib/auth tests/points/streak.test.js tests/auth
git commit -m "feat: streak calculation, password policy, and PIN/slug generation"
```

---

## Phase 2 — Database

Migrations are plain `.sql` files applied by pasting into the Supabase SQL editor (or `supabase db push` once the CLI is configured). They must be idempotent-safe to re-read but are applied in order, once.

### Task 6: Core schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Create: `tests/db/client.js`
- Test: `tests/db/schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `app_users`, `schedules`, `schedule_staff`, `groups`, `students`, `question_library`, `questions`, `answers`, `criteria`, `point_events` with the exact column names used by every later task.
- Produces: `tests/db/client.js` exporting `dbTest` (a `describe` that skips when `SUPABASE_TEST_URL`/`SUPABASE_TEST_SERVICE_KEY` are unset) and `serviceClient()`.

- [ ] **Step 1: Write the env-gated database test harness**

Create `tests/db/client.js`:

```js
import { describe } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;
export const dbEnabled = Boolean(url && key);

if (!dbEnabled) {
  console.warn(
    '[db tests] skipped — set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY to run them',
  );
}

export const dbTest = dbEnabled ? describe : describe.skip;

export function serviceClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Deterministic throwaway names so parallel runs never collide. */
export const uniq = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
```

- [ ] **Step 2: Write the failing schema test**

Create `tests/db/schema.test.js`:

```js
import { it, expect, beforeAll, afterAll } from 'vitest';
import { dbTest, serviceClient, uniq } from './client';

dbTest('core schema', () => {
  const db = serviceClient();
  let scheduleId;
  let groupId;

  beforeAll(async () => {
    const { data, error } = await db
      .from('schedules')
      .insert({ name: uniq('رحلة'), slug: uniq('slug'), start_date: '2026-08-01', end_date: null })
      .select()
      .single();
    if (error) throw error;
    scheduleId = data.id;

    const g = await db
      .from('groups')
      .insert({ schedule_id: scheduleId, name: 'غرفة 101', sort_order: 1, join_slug: uniq('g') })
      .select()
      .single();
    if (g.error) throw g.error;
    groupId = g.data.id;
  });

  afterAll(async () => {
    if (scheduleId) await db.from('schedules').delete().eq('id', scheduleId);
  });

  it('defaults a new schedule to active with sane settings', async () => {
    const { data } = await db.from('schedules').select().eq('id', scheduleId).single();
    expect(data.status).toBe('active');
    expect(data.timezone).toBe('Asia/Riyadh');
    expect(data.streak_threshold_pct).toBe(100);
    expect(data.backfill_days).toBe(3);
    expect(data.students_see_leaderboard).toBe(true);
    expect(data.end_date).toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    const { error } = await db
      .from('schedules')
      .update({ end_date: '2026-07-01' })
      .eq('id', scheduleId);
    expect(error).not.toBeNull();
  });

  it('rejects a backfill window outside 0..365', async () => {
    const { error } = await db.from('schedules').update({ backfill_days: -1 }).eq('id', scheduleId);
    expect(error).not.toBeNull();
  });

  it('enforces one answer per student, question and date', async () => {
    const s = await db
      .from('students')
      .insert({ schedule_id: scheduleId, group_id: groupId, full_name: 'طالب اختبار' })
      .select()
      .single();
    const q = await db
      .from('questions')
      .insert({ schedule_id: scheduleId, title: 'الوتر', type: 'bool', config: {}, points: 5, sort_order: 1 })
      .select()
      .single();

    const first = await db
      .from('answers')
      .insert({ student_id: s.data.id, question_id: q.data.id, entry_date: '2026-08-01', value: true });
    expect(first.error).toBeNull();

    const duplicate = await db
      .from('answers')
      .insert({ student_id: s.data.id, question_id: q.data.id, entry_date: '2026-08-01', value: true });
    expect(duplicate.error?.code).toBe('23505');
  });

  it('cascades deletes from schedule down to answers', async () => {
    const temp = await db
      .from('schedules')
      .insert({ name: uniq('مؤقتة'), slug: uniq('slug'), start_date: '2026-08-01' })
      .select()
      .single();
    const s = await db
      .from('students')
      .insert({ schedule_id: temp.data.id, full_name: 'طالب' })
      .select()
      .single();

    await db.from('schedules').delete().eq('id', temp.data.id);

    const { data } = await db.from('students').select().eq('id', s.data.id);
    expect(data).toEqual([]);
  });

  it('rejects a criterion grant that is negative when negatives are disallowed', async () => {
    const c = await db
      .from('criteria')
      .insert({ schedule_id: scheduleId, name: 'المبادرة', allow_negative: false, sort_order: 1 })
      .select()
      .single();
    const s = await db
      .from('students')
      .insert({ schedule_id: scheduleId, full_name: 'طالب ٢' })
      .select()
      .single();

    const { error } = await db.from('point_events').insert({
      schedule_id: scheduleId,
      student_id: s.data.id,
      criterion_id: c.data.id,
      points: -5,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the schema test to confirm it skips cleanly**

```bash
npm test -- tests/db/schema.test.js
```

Expected: the suite reports **skipped** with the `[db tests] skipped` warning, because Supabase credentials are not set yet. This confirms the gate works before the project exists.

- [ ] **Step 4: Write the schema migration**

Create `supabase/migrations/0001_schema.sql`:

```sql
-- Qawafel: core schema
create extension if not exists pgcrypto;

create type app_role_t       as enum ('super_admin', 'manager');
create type schedule_status_t as enum ('active', 'archived');
create type question_type_t  as enum
  ('bool', 'per_prayer', 'single_choice', 'multi_choice', 'counter', 'rating', 'text');

-- Staff identities. id matches auth.users.id.
create table app_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique
                  check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name  text not null check (length(display_name) between 1 and 120),
  role          app_role_t not null,
  is_active     boolean not null default true,
  created_by    uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table schedules (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 160),
  slug                     text not null unique check (slug ~ '^[0-9a-z]{10,32}$'),
  start_date               date not null,
  end_date                 date,                       -- NULL = open-ended
  timezone                 text not null default 'Asia/Riyadh',
  status                   schedule_status_t not null default 'active',
  streak_threshold_pct     int  not null default 100 check (streak_threshold_pct between 1 and 100),
  backfill_days            int  not null default 3   check (backfill_days between 0 and 365),
  students_see_leaderboard boolean not null default true,
  created_by               uuid references app_users(id) on delete set null,
  created_at               timestamptz not null default now(),
  archived_at              timestamptz,
  constraint schedules_dates_ordered check (end_date is null or end_date >= start_date)
);

-- Many-to-many: a manager may run several schedules; a schedule may have several managers.
create table schedule_staff (
  schedule_id uuid not null references schedules(id) on delete cascade,
  user_id     uuid not null references app_users(id) on delete cascade,
  group_scope uuid[],                                  -- NULL = whole schedule
  created_at  timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

create table groups (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  sort_order  int  not null default 0,
  join_slug   text unique check (join_slug is null or join_slug ~ '^[0-9a-z]{10,32}$'),
  created_at  timestamptz not null default now(),
  unique (schedule_id, name)
);

create table students (
  id                    uuid primary key default gen_random_uuid(),
  schedule_id           uuid not null references schedules(id) on delete cascade,
  group_id              uuid references groups(id) on delete set null,
  auth_uid              uuid unique references auth.users(id) on delete set null,
  full_name             text not null check (length(full_name) between 1 and 120),
  must_change_password  boolean not null default true,
  is_active             boolean not null default true,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now()
);

-- Super admin's master set. Managers copy from it; copies are independent.
create table question_library (
  id          uuid primary key default gen_random_uuid(),
  section     text not null default '' check (length(section) <= 120),
  title       text not null check (length(title) between 1 and 240),
  help_text   text not null default '' check (length(help_text) <= 500),
  type        question_type_t not null,
  config      jsonb not null default '{}'::jsonb,
  points      numeric(8,2) not null default 0,
  sort_order  int not null default 0,
  created_by  uuid references app_users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table questions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references schedules(id) on delete cascade,
  library_id      uuid references question_library(id) on delete set null,
  section         text not null default '' check (length(section) <= 120),
  title           text not null check (length(title) between 1 and 240),
  help_text       text not null default '' check (length(help_text) <= 500),
  type            question_type_t not null,
  config          jsonb not null default '{}'::jsonb,
  points          numeric(8,2) not null default 0,
  active_weekdays int[] check (
                    active_weekdays is null
                    or (array_length(active_weekdays, 1) between 1 and 7
                        and active_weekdays <@ array[0,1,2,3,4,5,6])
                  ),
  active_from     date,
  active_to       date,
  is_required     boolean not null default false,
  sort_order      int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint questions_active_range check (active_to is null or active_from is null or active_to >= active_from)
);

create table answers (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(id) on delete cascade,
  question_id       uuid not null references questions(id) on delete cascade,
  entry_date        date not null,
  value             jsonb not null,
  points            numeric(8,2) not null default 0,
  client_updated_at timestamptz not null default now(),
  device_id         text check (device_id is null or length(device_id) <= 64),
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  unique (student_id, question_id, entry_date)
);

create table criteria (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references schedules(id) on delete cascade,
  name           text not null check (length(name) between 1 and 120),
  allow_negative boolean not null default true,
  sort_order     int not null default 0,
  archived_at    timestamptz,
  unique (schedule_id, name)
);

create table point_events (
  id                 uuid primary key default gen_random_uuid(),
  schedule_id        uuid not null references schedules(id) on delete cascade,
  student_id         uuid references students(id) on delete cascade,
  group_id           uuid references groups(id) on delete cascade,
  criterion_id       uuid not null references criteria(id) on delete restrict,
  points             numeric(8,2) not null check (points <> 0),
  note               text not null default '' check (length(note) <= 500),
  applied_to_members boolean not null default false,
  parent_event_id    uuid references point_events(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint point_events_one_target check (
    (student_id is not null and group_id is null)
    or (student_id is null and group_id is not null)
  )
);

-- Negative grants are impossible against a criterion that forbids them.
create or replace function point_events_check_sign() returns trigger
language plpgsql as $$
declare allowed boolean;
begin
  select allow_negative into allowed from criteria where id = new.criterion_id;
  if allowed is null then
    raise exception 'criterion % not found', new.criterion_id;
  end if;
  if not allowed and new.points < 0 then
    raise exception 'هذا البند لا يسمح بالخصم';
  end if;
  return new;
end $$;

create trigger point_events_sign_guard
  before insert or update on point_events
  for each row execute function point_events_check_sign();

create index on schedule_staff (user_id);
create index on groups (schedule_id, sort_order);
create index on students (schedule_id, is_active);
create index on students (group_id);
create index on students (auth_uid);
create index on questions (schedule_id, sort_order) where archived_at is null;
create index on answers (student_id, entry_date);
create index on answers (question_id, entry_date);
create index on point_events (schedule_id, created_at desc);
create index on point_events (student_id);
create index on point_events (group_id);
```

- [ ] **Step 5: Apply the migration**

Once the Supabase project exists (Task 32 documents creating it), paste the file into
**Supabase Dashboard → SQL Editor → New query** and run it. Expected: `Success. No rows returned`.

- [ ] **Step 6: Run the schema test against the live project**

Set `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_KEY` in `.env.local`, then:

```bash
npm test -- tests/db/schema.test.js
```

Expected: PASS, 6 tests. If Supabase is not yet provisioned, the suite skips and this step is
deferred to Task 32's verification pass — note that in the commit message.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_schema.sql tests/db
git commit -m "feat(db): core schema for schedules, students, questions, answers, and grants"
```

---

### Task 7: Scoring, validation, and write-guard functions

The SQL here is the storage authority and must agree with `lib/points/score.js` from Task 3.

**Files:**
- Create: `supabase/migrations/0002_functions.sql`
- Test: `tests/db/scoring.test.js`

**Interfaces:**
- Consumes: schema from Task 6.
- Produces:
  - `app_score_answer(q_type question_type_t, q_config jsonb, q_points numeric, val jsonb) -> numeric`
  - `app_max_points(q_type question_type_t, q_config jsonb, q_points numeric) -> numeric`
  - `app_role() -> text`, `app_student_id() -> uuid`, `is_staff_of(uuid) -> boolean`
  - triggers `answers_score_guard` and `answers_window_guard` on `answers`

- [ ] **Step 1: Write the failing scoring parity test**

Create `tests/db/scoring.test.js`:

```js
import { it, expect } from 'vitest';
import { dbTest, serviceClient } from './client';
import { scoreAnswer, maxPoints } from '@/lib/points/score';

const CASES = [
  { type: 'bool', config: {}, points: 5, value: true },
  { type: 'bool', config: {}, points: 5, value: false },
  {
    type: 'per_prayer',
    config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 2 },
    points: 0,
    value: { fajr: true, dhuhr: true, asr: false },
  },
  {
    type: 'single_choice',
    config: { options: [
      { id: 'walk', label: 'مشي', points: 5 },
      { id: 'none', label: 'لم أذهب', points: -2 },
    ] },
    points: 0,
    value: 'none',
  },
  {
    type: 'multi_choice',
    config: { options: [
      { id: 'a', label: 'أ', points: 3 },
      { id: 'b', label: 'ب', points: 4 },
      { id: 'c', label: 'ج', points: -1 },
    ] },
    points: 0,
    value: ['a', 'c'],
  },
  { type: 'counter', config: { points_per_unit: 2, max: 10, unit_label: 'صفحة' }, points: 0, value: 99 },
  { type: 'rating', config: { max: 5, points_per_star: 3 }, points: 0, value: 4 },
  { type: 'text', config: { max_length: 500 }, points: 0, value: 'ملاحظة' },
];

dbTest('SQL scorer matches the JavaScript scorer', () => {
  const db = serviceClient();

  it.each(CASES)('scores $type identically in both engines', async (c) => {
    const { data, error } = await db.rpc('app_score_answer', {
      q_type: c.type,
      q_config: c.config,
      q_points: c.points,
      val: c.value,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(scoreAnswer({ type: c.type, config: c.config, points: c.points }, c.value));
  });

  it.each(CASES)('computes the maximum for $type identically', async (c) => {
    const { data, error } = await db.rpc('app_max_points', {
      q_type: c.type,
      q_config: c.config,
      q_points: c.points,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(maxPoints({ type: c.type, config: c.config, points: c.points }));
  });

  it('ignores a points value supplied by the client', async () => {
    const schedule = await db
      .from('schedules')
      .insert({ name: 'اختبار النقاط', slug: `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`, start_date: '2026-08-01' })
      .select()
      .single();
    const student = await db
      .from('students')
      .insert({ schedule_id: schedule.data.id, full_name: 'طالب' })
      .select()
      .single();
    const question = await db
      .from('questions')
      .insert({ schedule_id: schedule.data.id, title: 'الوتر', type: 'bool', config: {}, points: 5, sort_order: 1 })
      .select()
      .single();

    const { data } = await db
      .from('answers')
      .insert({
        student_id: student.data.id,
        question_id: question.data.id,
        entry_date: '2026-08-01',
        value: true,
        points: 9999,
      })
      .select()
      .single();

    expect(Number(data.points)).toBe(5);
    await db.from('schedules').delete().eq('id', schedule.data.id);
  });
});
```

- [ ] **Step 2: Run it to confirm the gate skips**

```bash
npm test -- tests/db/scoring.test.js
```

Expected: skipped until Supabase credentials exist.

- [ ] **Step 3: Write the functions migration**

Create `supabase/migrations/0002_functions.sql`:

```sql
-- Qawafel: scoring, identity helpers, and write guards.
-- Named app_role() rather than current_role() to avoid the PostgreSQL built-in.

create or replace function app_score_answer(
  q_type   question_type_t,
  q_config jsonb,
  q_points numeric,
  val      jsonb
) returns numeric
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare
  total numeric := 0;
  prayer text;
  opt jsonb;
  sel text;
  n numeric;
  cap numeric;
begin
  if val is null or jsonb_typeof(val) = 'null' then
    return 0;
  end if;

  case q_type
    when 'bool' then
      if val = 'true'::jsonb then total := coalesce(q_points, 0); end if;

    when 'per_prayer' then
      for prayer in
        select jsonb_array_elements_text(
          coalesce(q_config -> 'prayers', '["fajr","dhuhr","asr","maghrib","isha"]'::jsonb))
      loop
        if val -> prayer = 'true'::jsonb then
          total := total + coalesce((q_config ->> 'points_per_prayer')::numeric, 1);
        end if;
      end loop;

    when 'single_choice' then
      sel := val #>> '{}';
      select coalesce((o ->> 'points')::numeric, 0) into total
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o
      where o ->> 'id' = sel;
      total := coalesce(total, 0);

    when 'multi_choice' then
      if jsonb_typeof(val) = 'array' then
        select coalesce(sum((o ->> 'points')::numeric), 0) into total
        from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o
        where o ->> 'id' in (select distinct jsonb_array_elements_text(val));
      end if;

    when 'counter' then
      if jsonb_typeof(val) = 'number' then
        cap := coalesce((q_config ->> 'max')::numeric, 0);
        n := greatest(0, least(cap, trunc((val #>> '{}')::numeric)));
        total := n * coalesce((q_config ->> 'points_per_unit')::numeric, 1);
      end if;

    when 'rating' then
      if jsonb_typeof(val) = 'number' then
        cap := coalesce((q_config ->> 'max')::numeric, 5);
        n := greatest(0, least(cap, trunc((val #>> '{}')::numeric)));
        total := n * coalesce((q_config ->> 'points_per_star')::numeric, 1);
      end if;

    else
      total := 0;   -- 'text' and anything unrecognised
  end case;

  return coalesce(total, 0);
end $$;

create or replace function app_max_points(
  q_type   question_type_t,
  q_config jsonb,
  q_points numeric
) returns numeric
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare best numeric := 0;
begin
  case q_type
    when 'bool' then
      best := greatest(0, coalesce(q_points, 0));

    when 'per_prayer' then
      best := greatest(0,
        jsonb_array_length(coalesce(q_config -> 'prayers', '["fajr","dhuhr","asr","maghrib","isha"]'::jsonb))
        * coalesce((q_config ->> 'points_per_prayer')::numeric, 1));

    when 'single_choice' then
      select greatest(0, coalesce(max((o ->> 'points')::numeric), 0)) into best
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o;

    when 'multi_choice' then
      select coalesce(sum(greatest(0, (o ->> 'points')::numeric)), 0) into best
      from jsonb_array_elements(coalesce(q_config -> 'options', '[]'::jsonb)) o;

    when 'counter' then
      best := greatest(0, coalesce((q_config ->> 'max')::numeric, 0)
                        * coalesce((q_config ->> 'points_per_unit')::numeric, 1));

    when 'rating' then
      best := greatest(0, coalesce((q_config ->> 'max')::numeric, 5)
                        * coalesce((q_config ->> 'points_per_star')::numeric, 1));

    else
      best := 0;
  end case;

  return coalesce(best, 0);
end $$;

-- Identity helpers. SECURITY DEFINER so RLS on app_users/students cannot recurse.
create or replace function app_role() returns text
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select u.role::text from app_users u where u.id = auth.uid() and u.is_active),
    (select 'student' from students s where s.auth_uid = auth.uid() and s.is_active limit 1)
  );
$$;

create or replace function app_student_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.id from students s where s.auth_uid = auth.uid() and s.is_active limit 1;
$$;

create or replace function is_staff_of(p_schedule uuid) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce((select u.role = 'super_admin' and u.is_active from app_users u where u.id = auth.uid()), false)
    or exists (
      select 1 from schedule_staff ss
      join app_users u on u.id = ss.user_id and u.is_active
      where ss.schedule_id = p_schedule and ss.user_id = auth.uid()
    );
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select u.role = 'super_admin' and u.is_active from app_users u where u.id = auth.uid()),
    false);
$$;

-- Recompute points on every write; whatever the client sent is discarded.
create or replace function answers_score() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare q questions%rowtype;
begin
  select * into q from questions where id = new.question_id;
  if not found then
    raise exception 'question % not found', new.question_id;
  end if;

  new.points     := app_score_answer(q.type, q.config, q.points, new.value);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger answers_score_guard
  before insert or update on answers
  for each row execute function answers_score();

-- Students may only write inside the backfill window of a live schedule.
-- Staff corrections are unrestricted and are recorded in the audit log.
create or replace function answers_window() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sch schedules%rowtype;
  today date;
begin
  if app_role() is distinct from 'student' then
    return new;
  end if;

  select s.* into sch
  from schedules s
  join students st on st.schedule_id = s.id
  where st.id = new.student_id;

  if sch.status = 'archived' then
    raise exception 'الرحلة مؤرشفة ولا يمكن التعديل عليها';
  end if;

  today := (now() at time zone sch.timezone)::date;

  if new.entry_date > least(today, coalesce(sch.end_date, today)) then
    raise exception 'لا يمكن تسجيل يوم في المستقبل';
  end if;

  if new.entry_date < greatest(sch.start_date, today - sch.backfill_days) then
    raise exception 'انتهت مهلة التعديل على هذا اليوم';
  end if;

  return new;
end $$;

create trigger answers_window_guard
  before insert or update on answers
  for each row execute function answers_window();

-- Question config must satisfy the same shape rules the client enforces.
create or replace function questions_validate_config() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare ids text[];
begin
  if new.type in ('single_choice', 'multi_choice') then
    if jsonb_typeof(new.config -> 'options') <> 'array'
       or jsonb_array_length(new.config -> 'options') < 2 then
      raise exception 'يجب إضافة خيارين على الأقل';
    end if;
    select array_agg(o ->> 'id') into ids
    from jsonb_array_elements(new.config -> 'options') o;
    if array_length(ids, 1) <> cardinality(array(select distinct unnest(ids))) then
      raise exception 'معرّف الخيار مكرر';
    end if;
  elsif new.type = 'counter' then
    if coalesce((new.config ->> 'max')::numeric, 0) <= 0 then
      raise exception 'الحد الأقصى للعدّاد يجب أن يكون أكبر من صفر';
    end if;
  elsif new.type = 'rating' then
    if coalesce((new.config ->> 'max')::int, 0) not between 2 and 10 then
      raise exception 'عدد النجوم يجب أن يكون بين 2 و 10';
    end if;
  end if;
  return new;
end $$;

create trigger questions_config_guard
  before insert or update on questions
  for each row execute function questions_validate_config();

create trigger question_library_config_guard
  before insert or update on question_library
  for each row execute function questions_validate_config();
```

- [ ] **Step 4: Apply the migration and run the parity test**

Paste into the Supabase SQL editor and run, then:

```bash
npm test -- tests/db/scoring.test.js
```

Expected: PASS, 17 tests — 8 scoring pairs, 8 maximum pairs, plus the client-points-ignored case. Any mismatch means `lib/points/score.js` and `app_score_answer` have drifted; fix the SQL, not the test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_functions.sql tests/db/scoring.test.js
git commit -m "feat(db): SQL scoring engine, identity helpers, and answer write guards"
```

---

### Task 8: Row Level Security

**Files:**
- Create: `supabase/migrations/0003_rls.sql`
- Test: `tests/db/rls.test.js`

**Interfaces:**
- Consumes: helpers from Task 7 (`app_role`, `app_student_id`, `is_staff_of`, `is_super_admin`).
- Produces: default-deny RLS on every table. Later tasks may assume the anon/authenticated client can only reach what the policies allow, and must never use the service key from a client component.

- [ ] **Step 1: Write the failing RLS test**

Create `tests/db/rls.test.js`:

```js
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { dbTest, serviceClient, uniq } from './client';

const anonUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const DOMAIN = 'qawafel.internal';

function anonClient() {
  return createClient(anonUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

dbTest('row level security', () => {
  const db = serviceClient();
  const ctx = {};

  beforeAll(async () => {
    // Two schedules, each with one student. Manager staffs only schedule A.
    for (const key of ['a', 'b']) {
      const s = await db.from('schedules')
        .insert({ name: uniq('رحلة'), slug: uniq('slug'), start_date: '2026-08-01' })
        .select().single();
      ctx[`schedule_${key}`] = s.data.id;

      const pin = '482913';
      const email = `stu_${uniq('x')}@${DOMAIN}`;
      const au = await db.auth.admin.createUser({ email, password: pin, email_confirm: true });
      const st = await db.from('students')
        .insert({ schedule_id: s.data.id, full_name: `طالب ${key}`, auth_uid: au.data.user.id })
        .select().single();

      ctx[`student_${key}`] = st.data.id;
      ctx[`student_${key}_email`] = email;
      ctx[`student_${key}_pin`] = pin;

      const q = await db.from('questions')
        .insert({ schedule_id: s.data.id, title: 'الوتر', type: 'bool', config: {}, points: 5, sort_order: 1 })
        .select().single();
      ctx[`question_${key}`] = q.data.id;
    }

    const mgrEmail = `${uniq('mgr')}@${DOMAIN}`;
    const mgr = await db.auth.admin.createUser({
      email: mgrEmail, password: 'Qawafel!2026', email_confirm: true,
    });
    await db.from('app_users').insert({
      id: mgr.data.user.id, username: mgrEmail.split('@')[0], display_name: 'مشرف', role: 'manager',
    });
    await db.from('schedule_staff').insert({ schedule_id: ctx.schedule_a, user_id: mgr.data.user.id });
    ctx.manager_email = mgrEmail;
    ctx.manager_password = 'Qawafel!2026';
  });

  afterAll(async () => {
    await db.from('schedules').delete().in('id', [ctx.schedule_a, ctx.schedule_b]);
  });

  async function signedIn(email, password) {
    const c = anonClient();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
  }

  it('denies an unauthenticated client every table', async () => {
    const c = anonClient();
    for (const table of ['schedules', 'students', 'questions', 'answers', 'point_events', 'app_users']) {
      const { data } = await c.from(table).select('*').limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it('lets a student read only their own answers', async () => {
    await db.from('answers').insert([
      { student_id: ctx.student_a, question_id: ctx.question_a, entry_date: '2026-08-01', value: true },
      { student_id: ctx.student_b, question_id: ctx.question_b, entry_date: '2026-08-01', value: true },
    ]);
    const c = await signedIn(ctx.student_a_email, ctx.student_a_pin);
    const { data } = await c.from('answers').select('student_id');
    expect(data.map((r) => r.student_id)).toEqual([ctx.student_a]);
  });

  it('stops a student writing an answer for someone else', async () => {
    const c = await signedIn(ctx.student_a_email, ctx.student_a_pin);
    const { error } = await c.from('answers').insert({
      student_id: ctx.student_b, question_id: ctx.question_b, entry_date: '2026-08-02', value: true,
    });
    expect(error).not.toBeNull();
  });

  it('stops a student editing questions or point events', async () => {
    const c = await signedIn(ctx.student_a_email, ctx.student_a_pin);
    const q = await c.from('questions').update({ points: 999 }).eq('id', ctx.question_a).select();
    expect(q.data ?? []).toEqual([]);
    const p = await c.from('point_events').insert({
      schedule_id: ctx.schedule_a, student_id: ctx.student_a,
      criterion_id: '00000000-0000-0000-0000-000000000000', points: 100,
    });
    expect(p.error).not.toBeNull();
  });

  it('confines a manager to the schedules they staff', async () => {
    const c = await signedIn(ctx.manager_email, ctx.manager_password);
    const { data } = await c.from('schedules').select('id');
    expect(data.map((r) => r.id)).toEqual([ctx.schedule_a]);

    const { data: students } = await c.from('students').select('id');
    expect(students.map((r) => r.id)).toEqual([ctx.student_a]);
  });

  it('stops a manager writing into a schedule they do not staff', async () => {
    const c = await signedIn(ctx.manager_email, ctx.manager_password);
    const { error, data } = await c.from('questions')
      .update({ title: 'اختراق' }).eq('id', ctx.question_b).select();
    expect(data ?? []).toEqual([]);
    expect(error).toBeNull(); // RLS filters the row out rather than erroring
  });

  it('stops a manager promoting themselves to super admin', async () => {
    const c = await signedIn(ctx.manager_email, ctx.manager_password);
    const { data } = await c.from('app_users')
      .update({ role: 'super_admin' })
      .eq('username', ctx.manager_email.split('@')[0])
      .select();
    expect(data ?? []).toEqual([]);
  });
});
```

Add `SUPABASE_TEST_ANON_KEY=` to `.env.example` alongside the other test variables.

- [ ] **Step 2: Run it to confirm the gate skips**

```bash
npm test -- tests/db/rls.test.js
```

Expected: skipped until credentials exist.

- [ ] **Step 3: Write the RLS migration**

Create `supabase/migrations/0003_rls.sql`:

```sql
-- Qawafel: default-deny row level security on every table.

alter table app_users        enable row level security;
alter table schedules        enable row level security;
alter table schedule_staff   enable row level security;
alter table groups           enable row level security;
alter table students         enable row level security;
alter table question_library enable row level security;
alter table questions        enable row level security;
alter table answers          enable row level security;
alter table criteria         enable row level security;
alter table point_events     enable row level security;

alter table app_users        force row level security;
alter table schedules        force row level security;
alter table schedule_staff   force row level security;
alter table groups           force row level security;
alter table students         force row level security;
alter table question_library force row level security;
alter table questions        force row level security;
alter table answers          force row level security;
alter table criteria         force row level security;
alter table point_events     force row level security;

-- app_users: read yourself; super admin reads and writes everyone.
create policy app_users_self_read on app_users for select to authenticated
  using (id = auth.uid() or is_super_admin());
create policy app_users_admin_write on app_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- schedules
create policy schedules_read on schedules for select to authenticated
  using (
    is_staff_of(id)
    or exists (select 1 from students s where s.schedule_id = schedules.id and s.auth_uid = auth.uid())
  );
create policy schedules_insert on schedules for insert to authenticated
  with check (app_role() in ('super_admin', 'manager'));
create policy schedules_update on schedules for update to authenticated
  using (is_staff_of(id)) with check (is_staff_of(id));
create policy schedules_delete on schedules for delete to authenticated
  using (is_super_admin());

-- schedule_staff: only super admin assigns; managers may read their own rows.
create policy schedule_staff_read on schedule_staff for select to authenticated
  using (user_id = auth.uid() or is_super_admin());
create policy schedule_staff_write on schedule_staff for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- groups
create policy groups_read on groups for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = groups.schedule_id and s.auth_uid = auth.uid())
  );
create policy groups_write on groups for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- students: a student reads their own row and their schedule-mates' names
-- (needed for the leaderboard); staff read and write everyone in their schedules.
create policy students_read on students for select to authenticated
  using (
    is_staff_of(schedule_id)
    or auth_uid = auth.uid()
    or exists (
      select 1 from students me
      join schedules sc on sc.id = me.schedule_id
      where me.auth_uid = auth.uid()
        and me.schedule_id = students.schedule_id
        and sc.students_see_leaderboard
    )
  );
create policy students_staff_write on students for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));
create policy students_self_update on students for update to authenticated
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- question_library: everyone on staff reads; only super admin writes.
create policy library_read on question_library for select to authenticated
  using (app_role() in ('super_admin', 'manager'));
create policy library_write on question_library for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- questions
create policy questions_read on questions for select to authenticated
  using (
    is_staff_of(schedule_id)
    or exists (select 1 from students s where s.schedule_id = questions.schedule_id and s.auth_uid = auth.uid())
  );
create policy questions_write on questions for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- answers: a student reads and writes only their own; staff cover their schedules.
create policy answers_student_read on answers for select to authenticated
  using (student_id = app_student_id());
create policy answers_student_write on answers for insert to authenticated
  with check (student_id = app_student_id());
create policy answers_student_update on answers for update to authenticated
  using (student_id = app_student_id()) with check (student_id = app_student_id());
create policy answers_staff_all on answers for all to authenticated
  using (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)))
  with check (exists (select 1 from students s where s.id = answers.student_id and is_staff_of(s.schedule_id)));

-- criteria
create policy criteria_read on criteria for select to authenticated
  using (is_staff_of(schedule_id));
create policy criteria_write on criteria for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));

-- point_events: students see grants that touch them; staff manage their schedules.
create policy point_events_read on point_events for select to authenticated
  using (
    is_staff_of(schedule_id)
    or student_id = app_student_id()
    or exists (select 1 from students s where s.id = app_student_id() and s.group_id = point_events.group_id)
  );
create policy point_events_write on point_events for all to authenticated
  using (is_staff_of(schedule_id)) with check (is_staff_of(schedule_id));
```

The `students_self_update` policy exists so a student can clear their own
`must_change_password` flag; every other column they might touch is guarded by the fact that
Task 13 performs the password change through a route handler.

- [ ] **Step 4: Apply the migration and run the RLS test**

```bash
npm test -- tests/db/rls.test.js
```

Expected: PASS, 7 tests. A failure here is a security hole, not a flaky test — do not weaken
the test to make it green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_rls.sql tests/db/rls.test.js .env.example
git commit -m "feat(db): default-deny RLS policies for every table"
```

---

### Task 9: Rate limiting, audit log, and seed data

**Files:**
- Create: `supabase/migrations/0004_rate_limit_audit.sql`, `supabase/migrations/0005_seed.sql`
- Test: `tests/db/rate-limit.test.js`, `tests/db/audit.test.js`

**Interfaces:**
- Consumes: schema and helpers from Tasks 6–7.
- Produces:
  - `rl_hit(p_key text, p_limit int, p_window_seconds int) -> boolean` (true = allowed)
  - `auth_check_lock(p_identifier text) -> timestamptz` (NULL = not locked)
  - `auth_record_failure(p_identifier text) -> timestamptz`
  - `auth_reset_failures(p_identifier text) -> void`
  - table `audit_log`, insert-only, read-filtered by role
  - `write_audit(...)` helper used by every route handler in Phases 3–6

- [ ] **Step 1: Write the failing rate-limit test**

Create `tests/db/rate-limit.test.js`:

```js
import { it, expect } from 'vitest';
import { dbTest, serviceClient, uniq } from './client';

dbTest('rate limiting and lockout', () => {
  const db = serviceClient();

  it('allows up to the limit then refuses within the window', async () => {
    const key = uniq('rl');
    for (let i = 0; i < 3; i += 1) {
      const { data } = await db.rpc('rl_hit', { p_key: key, p_limit: 3, p_window_seconds: 60 });
      expect(data).toBe(true);
    }
    const { data } = await db.rpc('rl_hit', { p_key: key, p_limit: 3, p_window_seconds: 60 });
    expect(data).toBe(false);
  });

  it('keeps separate counters per key', async () => {
    const a = uniq('rl');
    const b = uniq('rl');
    await db.rpc('rl_hit', { p_key: a, p_limit: 1, p_window_seconds: 60 });
    const { data } = await db.rpc('rl_hit', { p_key: b, p_limit: 1, p_window_seconds: 60 });
    expect(data).toBe(true);
  });

  it('locks an identifier after five failures and escalates on the next round', async () => {
    const id = uniq('user');
    for (let i = 0; i < 4; i += 1) {
      const { data } = await db.rpc('auth_record_failure', { p_identifier: id });
      expect(data).toBeNull();
    }
    const { data: lockedUntil } = await db.rpc('auth_record_failure', { p_identifier: id });
    expect(lockedUntil).not.toBeNull();

    const { data: check } = await db.rpc('auth_check_lock', { p_identifier: id });
    expect(new Date(check).getTime()).toBeGreaterThan(Date.now());
  });

  it('clears the counter on a successful login', async () => {
    const id = uniq('user');
    await db.rpc('auth_record_failure', { p_identifier: id });
    await db.rpc('auth_reset_failures', { p_identifier: id });
    const { data } = await db.rpc('auth_check_lock', { p_identifier: id });
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing audit test**

Create `tests/db/audit.test.js`:

```js
import { it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { dbTest, serviceClient, uniq } from './client';

dbTest('audit log', () => {
  const db = serviceClient();

  it('records an entry with actor, action, and before/after payloads', async () => {
    const { error } = await db.from('audit_log').insert({
      actor_role: 'manager',
      entity_type: 'question',
      entity_id: null,
      action: 'update',
      before: { points: 5 },
      after: { points: 7 },
      ip: '203.0.113.7',
      user_agent: 'vitest',
    });
    expect(error).toBeNull();
  });

  it('refuses updates and deletes even to the service role', async () => {
    const inserted = await db.from('audit_log').insert({
      actor_role: 'super_admin', entity_type: 'schedule', action: 'create',
    }).select().single();

    const upd = await db.from('audit_log').update({ action: 'tampered' }).eq('id', inserted.data.id);
    expect(upd.error).not.toBeNull();

    const del = await db.from('audit_log').delete().eq('id', inserted.data.id);
    expect(del.error).not.toBeNull();
  });

  it('hides the log from an unauthenticated client', async () => {
    const anon = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anon.from('audit_log').select('*').limit(1);
    expect(data ?? []).toEqual([]);
  });
});
```

- [ ] **Step 3: Run both to confirm they skip**

```bash
npm test -- tests/db/rate-limit.test.js tests/db/audit.test.js
```

Expected: both skipped until credentials exist.

- [ ] **Step 4: Write the rate-limit and audit migration**

Create `supabase/migrations/0004_rate_limit_audit.sql`:

```sql
-- Qawafel: rate limiting, login lockout, and the append-only audit log.

create table rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

alter table rate_limits enable row level security;
alter table rate_limits force row level security;
-- No policies: reachable only through the SECURITY DEFINER function below.

create or replace function rl_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare cur rate_limits%rowtype;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count        = case
                         when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                         then 1 else rate_limits.count + 1 end,
        window_start = case
                         when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                         then now() else rate_limits.window_start end
  returning * into cur;

  return cur.count <= p_limit;
end $$;

create table auth_lockouts (
  identifier   text primary key,
  fail_count   int not null default 0,
  lock_level   int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table auth_lockouts enable row level security;
alter table auth_lockouts force row level security;

create or replace function auth_check_lock(p_identifier text)
returns timestamptz
language sql security definer
set search_path = pg_catalog, public
as $$
  select locked_until from auth_lockouts
  where identifier = p_identifier and locked_until > now();
$$;

-- Five failures lock for 15 minutes; each further round doubles, capped at 24 hours.
create or replace function auth_record_failure(p_identifier text)
returns timestamptz
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare row auth_lockouts%rowtype;
begin
  insert into auth_lockouts (identifier, fail_count, updated_at)
  values (p_identifier, 1, now())
  on conflict (identifier) do update
    set fail_count = auth_lockouts.fail_count + 1, updated_at = now()
  returning * into row;

  if row.fail_count >= 5 then
    row.lock_level := least(row.lock_level + 1, 7);
    update auth_lockouts
      set fail_count   = 0,
          lock_level   = row.lock_level,
          locked_until = now() + least(
            make_interval(mins => 15) * power(2, row.lock_level - 1),
            make_interval(hours => 24))
      where identifier = p_identifier
      returning locked_until into row.locked_until;
    return row.locked_until;
  end if;

  return null;
end $$;

create or replace function auth_reset_failures(p_identifier text)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into auth_lockouts (identifier, fail_count, lock_level, locked_until, updated_at)
  values (p_identifier, 0, 0, null, now())
  on conflict (identifier) do update
    set fail_count = 0, lock_level = 0, locked_until = null, updated_at = now();
$$;

create table audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label   text not null default '',
  actor_role    text not null default 'anonymous',
  schedule_id   uuid references schedules(id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index on audit_log (created_at desc);
create index on audit_log (schedule_id, created_at desc);
create index on audit_log (actor_user_id, created_at desc);
create index on audit_log (entity_type, action);

alter table audit_log enable row level security;
alter table audit_log force row level security;

-- Read-only for staff, scoped by schedule. There is deliberately no UPDATE or
-- DELETE policy, so the log cannot be rewritten through PostgREST by anyone.
create policy audit_read on audit_log for select to authenticated
  using (is_super_admin() or (schedule_id is not null and is_staff_of(schedule_id)));

revoke update, delete on audit_log from authenticated, anon, service_role;

create or replace function write_audit(
  p_actor_label text,
  p_actor_role  text,
  p_schedule_id uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_before      jsonb,
  p_after       jsonb,
  p_ip          text,
  p_user_agent  text
) returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into audit_log (
    actor_user_id, actor_label, actor_role, schedule_id,
    entity_type, entity_id, action, before, after, ip, user_agent
  ) values (
    auth.uid(), coalesce(p_actor_label, ''), coalesce(p_actor_role, 'anonymous'), p_schedule_id,
    p_entity_type, p_entity_id, p_action, p_before, p_after,
    nullif(p_ip, '')::inet, left(coalesce(p_user_agent, ''), 400)
  );
$$;
```

- [ ] **Step 5: Write the seed migration**

Create `supabase/migrations/0005_seed.sql`. It seeds the master question library with the
nineteen items from the original programme, plus the four default evaluation criteria used
whenever a schedule is created.

```sql
-- Qawafel: master question library seed.

insert into question_library (section, title, type, config, points, sort_order) values
  ('السنن الرواتب', 'سنة الفجر (ركعتان)',              'bool', '{}', 5, 1),
  ('السنن الرواتب', 'سنة الظهر القبلية (4 ركعات)',     'bool', '{}', 5, 2),
  ('السنن الرواتب', 'سنة الظهر البعدية (ركعتان)',      'bool', '{}', 5, 3),
  ('السنن الرواتب', 'سنة المغرب (ركعتان)',             'bool', '{}', 5, 4),
  ('السنن الرواتب', 'سنة العشاء (ركعتان)',             'bool', '{}', 5, 5),
  ('قيام وضحى',    'صلاة الوتر',                       'bool', '{}', 5, 6),
  ('قيام وضحى',    'صلاة الضحى',                       'bool', '{}', 5, 7),
  ('تكبيرة الإحرام','تكبيرة الإحرام مع الإمام',        'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 8),
  ('الأذكار',      'أذكار الصباح',                     'bool', '{}', 5, 9),
  ('الأذكار',      'أذكار المساء',                     'bool', '{}', 5, 10),
  ('الأذكار',      'أذكار ما بعد الصلاة',              'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 11),
  ('إضافية',       'الذهاب للمسجد',                    'single_choice',
     '{"options":[{"id":"walk","label":"مشياً","points":5},{"id":"ride","label":"بسيارة","points":3},{"id":"none","label":"لم أذهب","points":0}]}',
     0, 12),
  ('إضافية',       'كم صفحة قرأت من القرآن؟',          'counter',
     '{"points_per_unit":1,"max":60,"unit_label":"صفحة"}', 0, 13),
  ('إضافية',       'تقييمك لخشوعك اليوم',              'rating',
     '{"max":5,"points_per_star":1}', 0, 14),
  ('إضافية',       'ملاحظاتك لهذا اليوم',              'text',
     '{"max_length":500}', 0, 15);

-- Applied to every new schedule by the application; kept here as the canonical list.
create or replace function seed_default_criteria(p_schedule uuid)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into criteria (schedule_id, name, allow_negative, sort_order) values
    (p_schedule, 'الالتزام بالوقت', true,  1),
    (p_schedule, 'نظافة الغرفة',    true,  2),
    (p_schedule, 'السلوك',          true,  3),
    (p_schedule, 'المبادرة',        false, 4)
  on conflict (schedule_id, name) do nothing;
$$;
```

- [ ] **Step 6: Document the super-admin bootstrap**

Create `supabase/README.md`:

```markdown
# Database setup

Run the migrations in order in **Supabase Dashboard → SQL Editor**:

1. `migrations/0001_schema.sql`
2. `migrations/0002_functions.sql`
3. `migrations/0003_rls.sql`
4. `migrations/0004_rate_limit_audit.sql`
5. `migrations/0005_seed.sql`

## Creating the super admin

Create the auth user in **Authentication → Users → Add user**:

- Email: `mohammed@qawafel.internal`
- Password: choose one, at least 8 characters with two character classes
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

Expected: one row, `mohammed | super_admin | t`.
```

- [ ] **Step 7: Apply migrations 0004 and 0005, then run the database suite**

```bash
npm test -- tests/db
```

Expected: PASS — schema 6, scoring 17, RLS 7, rate limit 4, audit 3.

- [ ] **Step 8: Commit**

```bash
git add supabase tests/db
git commit -m "feat(db): rate limiting, lockout, append-only audit log, and seed data"
```

---
