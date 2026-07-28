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

## Phase 3 — Authentication

### Task 10: Supabase clients, identity mapping, and request context

**Files:**
- Create: `lib/supabase/browser.js`, `lib/supabase/server.js`, `lib/auth/identity.js`, `lib/http/request-context.js`
- Test: `tests/auth/identity.test.js`, `tests/http/request-context.test.js`

**Interfaces:**
- Produces:
  - `getBrowserClient() -> SupabaseClient` — singleton, `persistSession: true`, `storageKey: 'qawafel.session'`
  - `createServiceClient() -> SupabaseClient` — server only; throws if called where `SUPABASE_SERVICE_ROLE_KEY` is absent
  - `createRequestClient(accessToken) -> SupabaseClient` — anon key plus the caller's bearer token, so RLS applies
  - `staffEmail(username) -> string`, `studentEmail(studentId) -> string`, `usernameFromEmail(email) -> string`
  - `clientIp(request) -> string`, `sameOrigin(request) -> boolean`, `userAgent(request) -> string`

- [ ] **Step 1: Write the failing identity test**

Create `tests/auth/identity.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { staffEmail, studentEmail, usernameFromEmail, normalizeUsername } from '@/lib/auth/identity';

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  Mohammed  ')).toBe('mohammed');
  });

  it('rejects characters outside the allowed set', () => {
    expect(() => normalizeUsername('mo hammed')).toThrow();
    expect(() => normalizeUsername('mo@hammed')).toThrow();
    expect(() => normalizeUsername('ab')).toThrow();
    expect(() => normalizeUsername('a'.repeat(33))).toThrow();
  });
});

describe('staffEmail', () => {
  it('maps a username onto the internal domain', () => {
    expect(staffEmail('mohammed')).toBe('mohammed@qawafel.internal');
  });

  it('normalizes before mapping so casing cannot fork an identity', () => {
    expect(staffEmail('MOHAMMED')).toBe('mohammed@qawafel.internal');
  });
});

describe('studentEmail', () => {
  it('derives a stable address from the student id', () => {
    const id = '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
    expect(studentEmail(id)).toBe(`stu_${id}@qawafel.internal`);
  });
});

describe('usernameFromEmail', () => {
  it('reverses staffEmail', () => {
    expect(usernameFromEmail('mohammed@qawafel.internal')).toBe('mohammed');
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

```bash
npm test -- tests/auth/identity.test.js
```

Expected: FAIL — module not found.

Create `lib/auth/identity.js`:

```js
export const AUTH_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'qawafel.internal';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(raw) {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new Error('اسم المستخدم يجب أن يكون بين 3 و 32 حرفاً إنجليزياً أو رقماً أو شرطة سفلية');
  }
  return name;
}

export function staffEmail(username) {
  return `${normalizeUsername(username)}@${AUTH_DOMAIN}`;
}

export function studentEmail(studentId) {
  return `stu_${studentId}@${AUTH_DOMAIN}`;
}

export function usernameFromEmail(email) {
  return String(email ?? '').split('@')[0].toLowerCase();
}
```

Because `AUTH_DOMAIN` is read at module load, the test must run with the default; do not set
`AUTH_EMAIL_DOMAIN` in the test environment.

- [ ] **Step 3: Implement the Supabase clients**

Create `lib/supabase/browser.js`:

```js
'use client';

import { createClient } from '@supabase/supabase-js';

let client;

export function getBrowserClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'qawafel.session',
        },
      },
    );
  }
  return client;
}
```

Create `lib/supabase/server.js`:

```js
import 'server-only';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Full-privilege client. Never import this from a client component. */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client carrying the caller's token, so every query is still filtered by RLS. */
export function createRequestClient(accessToken) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}
```

Install the guard package so a stray client-side import fails at build time:

```bash
npm install server-only
```

- [ ] **Step 4: Write the failing request-context test**

Create `tests/http/request-context.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { clientIp, sameOrigin, bearerToken } from '@/lib/http/request-context';

const req = (headers, url = 'https://qawafel.app/api/x') =>
  new Request(url, { method: 'POST', headers });

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip and then to empty', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(req({}))).toBe('');
  });

  it('rejects a malformed forwarded value rather than trusting it', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'not-an-ip' }))).toBe('');
  });
});

describe('sameOrigin', () => {
  it('accepts a same-origin request', () => {
    expect(sameOrigin(req({ origin: 'https://qawafel.app' }))).toBe(true);
  });

  it('accepts sec-fetch-site same-origin without an Origin header', () => {
    expect(sameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('rejects a cross-site request', () => {
    expect(sameOrigin(req({ origin: 'https://evil.example' }))).toBe(false);
    expect(sameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('rejects a request with neither header', () => {
    expect(sameOrigin(req({}))).toBe(false);
  });
});

describe('bearerToken', () => {
  it('extracts the token and ignores a malformed header', () => {
    expect(bearerToken(req({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
    expect(bearerToken(req({ authorization: 'Basic abc' }))).toBe(null);
    expect(bearerToken(req({}))).toBe(null);
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then implement**

```bash
npm test -- tests/http/request-context.test.js
```

Expected: FAIL — module not found.

Create `lib/http/request-context.js`:

```js
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function validIp(value) {
  const ip = String(value ?? '').trim();
  if (!ip) return '';
  if (IPV4.test(ip) && ip.split('.').every((o) => Number(o) <= 255)) return ip;
  if (ip.includes(':') && IPV6.test(ip)) return ip;
  return '';
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = validIp(forwarded.split(',')[0]);
    if (first) return first;
  }
  return validIp(request.headers.get('x-real-ip'));
}

export function userAgent(request) {
  return (request.headers.get('user-agent') || '').slice(0, 400);
}

export function sameOrigin(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
```

- [ ] **Step 6: Run both tests, then commit**

```bash
npm test -- tests/auth/identity.test.js tests/http/request-context.test.js
```

Expected: PASS, 15 tests.

```bash
git add lib/supabase lib/auth/identity.js lib/http tests/auth/identity.test.js tests/http package.json package-lock.json
git commit -m "feat(auth): Supabase client factories, identity mapping, and request context helpers"
```

---

### Task 11: Login route handler

The single most security-sensitive file in the project.

**Files:**
- Create: `lib/validation/auth.js`, `lib/audit/write.js`, `app/api/auth/login/route.js`
- Test: `tests/api/login.test.js`

**Interfaces:**
- Consumes: Task 9 RPCs, Task 10 clients and helpers, Task 5 password validators.
- Produces: `POST /api/auth/login` accepting
  `{ mode: 'staff', username, password }` or `{ mode: 'student', studentId, pin, slug }`,
  returning `200 { session, role, mustChangePassword, redirect }` or a uniform error.
- Produces: `writeAudit(client, entry)` from `lib/audit/write.js`.

- [ ] **Step 1: Write the failing login test**

Create `tests/api/login.test.js`. It exercises the handler directly with mocked Supabase
modules, so it runs with no network:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const signIn = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc,
    from,
    auth: { signInWithPassword: signIn },
  }),
  createRequestClient: () => ({ rpc, from }),
}));

const { POST } = await import('@/app/api/auth/login/route');

const post = (body, headers = {}) =>
  POST(new Request('https://qawafel.app/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://qawafel.app', ...headers },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  rpc.mockReset();
  signIn.mockReset();
  from.mockReset();
  rpc.mockImplementation((name) => {
    if (name === 'rl_hit') return Promise.resolve({ data: true });
    if (name === 'auth_check_lock') return Promise.resolve({ data: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('POST /api/auth/login', () => {
  it('rejects a cross-site request before touching the database', async () => {
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Qawafel!2026' }, {
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 and no sign-in attempt', async () => {
    const res = await post({ mode: 'staff', username: 'x' });
    expect(res.status).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode', async () => {
    expect((await post({ mode: 'root', username: 'a', password: 'b' })).status).toBe(400);
  });

  it('returns 429 when the IP rate limit is exhausted', async () => {
    rpc.mockImplementation((name) => (name === 'rl_hit'
      ? Promise.resolve({ data: false })
      : Promise.resolve({ data: null })));
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Qawafel!2026' });
    expect(res.status).toBe(429);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('returns 429 while an identifier is locked out', async () => {
    rpc.mockImplementation((name) => {
      if (name === 'rl_hit') return Promise.resolve({ data: true });
      if (name === 'auth_check_lock') {
        return Promise.resolve({ data: new Date(Date.now() + 600_000).toISOString() });
      }
      return Promise.resolve({ data: null });
    });
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Qawafel!2026' });
    expect(res.status).toBe(429);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('records a failure and returns a generic message on bad credentials', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'WrongPass1' });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('بيانات الدخول غير صحيحة');
    expect(body.error).not.toMatch(/Invalid login/);
    expect(rpc).toHaveBeenCalledWith('auth_record_failure', expect.anything());
  });

  it('returns the same generic message for an unknown username as for a wrong password', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'User not found' } });
    const unknown = await (await post({ mode: 'staff', username: 'nobody', password: 'WrongPass1' })).json();
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const wrong = await (await post({ mode: 'staff', username: 'mohammed', password: 'WrongPass1' })).json();
    expect(unknown.error).toBe(wrong.error);
  });

  it('signs a manager in, clears the lockout, and reports their role', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'ref' }, user: { id: 'u1' } },
      error: null,
    });
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'u1', role: 'manager', display_name: 'مشرف', is_active: true },
      }) }) }),
    });

    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Qawafel!2026' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('manager');
    expect(body.session.access_token).toBe('tok');
    expect(rpc).toHaveBeenCalledWith('auth_reset_failures', expect.anything());
    expect(rpc).toHaveBeenCalledWith('write_audit', expect.objectContaining({ p_action: 'login' }));
  });

  it('refuses a deactivated staff account even with the right password', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'u1' } }, error: null,
    });
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'u1', role: 'manager', is_active: false },
      }) }) }),
    });
    expect((await post({ mode: 'staff', username: 'mohammed', password: 'Qawafel!2026' })).status).toBe(403);
  });

  it('rejects a student whose id is not in the schedule named by the slug', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    });
    const res = await post({ mode: 'student', studentId: '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8', pin: '482913', slug: 'abcdefghij' });
    expect(res.status).toBe(401);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('flags a student who must still change their PIN', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 's1', schedule_id: 'sch1', full_name: 'طالب', must_change_password: true, is_active: true },
      }) }) }) }),
    });
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'au1' } }, error: null,
    });

    const body = await (await post({
      mode: 'student', studentId: '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8', pin: '482913', slug: 'abcdefghij',
    })).json();

    expect(body.role).toBe('student');
    expect(body.mustChangePassword).toBe(true);
    expect(body.redirect).toBe('/change-password');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- tests/api/login.test.js
```

Expected: FAIL — `@/app/api/auth/login/route` does not exist.

- [ ] **Step 3: Implement the validation schemas**

Create `lib/validation/auth.js`:

```js
import { z } from 'zod';

const uuid = z.string().uuid();

export const loginSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('staff'),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/),
    password: z.string().min(8).max(128),
  }).strict(),
  z.object({
    mode: z.literal('student'),
    studentId: uuid,
    pin: z.string().regex(/^[0-9]{6}$/),
    slug: z.string().regex(/^[0-9a-z]{10,32}$/),
  }).strict(),
]);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(6).max(128),
}).strict();
```

- [ ] **Step 4: Implement the audit writer**

Create `lib/audit/write.js`:

```js
import 'server-only';

/**
 * Fire-and-forget audit write. Never throws: a logging failure must not
 * turn a successful user action into an error response.
 */
export async function writeAudit(client, entry) {
  try {
    await client.rpc('write_audit', {
      p_actor_label: entry.actorLabel ?? '',
      p_actor_role: entry.actorRole ?? 'anonymous',
      p_schedule_id: entry.scheduleId ?? null,
      p_entity_type: entry.entityType,
      p_entity_id: entry.entityId ?? null,
      p_action: entry.action,
      p_before: entry.before ?? null,
      p_after: entry.after ?? null,
      p_ip: entry.ip ?? '',
      p_user_agent: entry.userAgent ?? '',
    });
  } catch (err) {
    console.error('[audit] write failed', entry.entityType, entry.action, err?.message);
  }
}
```

- [ ] **Step 5: Implement the login route**

Create `app/api/auth/login/route.js`:

```js
import { createServiceClient } from '@/lib/supabase/server';
import { clientIp, sameOrigin, userAgent } from '@/lib/http/request-context';
import { loginSchema } from '@/lib/validation/auth';
import { staffEmail, studentEmail } from '@/lib/auth/identity';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = 'بيانات الدخول غير صحيحة';

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const input = parsed.data;

  const db = createServiceClient();
  const ip = clientIp(request);
  const ua = userAgent(request);

  // Per-IP throttle first, so an attacker cannot enumerate identifiers cheaply.
  const ipGate = await db.rpc('rl_hit', {
    p_key: `login:ip:${ip || 'unknown'}`, p_limit: 20, p_window_seconds: 600,
  });
  if (ipGate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  const identifier = input.mode === 'staff' ? `staff:${input.username}` : `student:${input.studentId}`;

  const lock = await db.rpc('auth_check_lock', { p_identifier: identifier });
  if (lock.data) return json({ error: 'تم إيقاف الحساب مؤقتاً بسبب محاولات خاطئة' }, 429);

  const idGate = await db.rpc('rl_hit', {
    p_key: `login:id:${identifier}`, p_limit: 10, p_window_seconds: 600,
  });
  if (idGate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  async function fail(reason) {
    await db.rpc('auth_record_failure', { p_identifier: identifier });
    await writeAudit(db, {
      actorLabel: identifier, actorRole: 'anonymous',
      entityType: 'auth', action: 'login_failed',
      after: { reason }, ip, userAgent: ua,
    });
    return json({ error: GENERIC }, 401);
  }

  let email;
  let student = null;

  if (input.mode === 'student') {
    // The student must belong to the schedule the join link names.
    const { data } = await db
      .from('students')
      .select('id, schedule_id, full_name, must_change_password, is_active, schedules!inner(slug, status)')
      .eq('id', input.studentId)
      .eq('schedules.slug', input.slug)
      .maybeSingle();

    if (!data || data.is_active === false) return fail('student_not_in_schedule');
    student = data;
    email = studentEmail(input.studentId);
  } else {
    email = staffEmail(input.username);
  }

  const password = input.mode === 'student' ? input.pin : input.password;
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !auth?.session) return fail('bad_credentials');

  if (input.mode === 'staff') {
    const { data: profile } = await db
      .from('app_users')
      .select('id, role, display_name, is_active')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (!profile) return fail('no_profile');
    if (!profile.is_active) {
      await writeAudit(db, {
        actorLabel: input.username, actorRole: profile.role,
        entityType: 'auth', action: 'login_blocked_inactive', ip, userAgent: ua,
      });
      return json({ error: 'الحساب معطّل' }, 403);
    }

    await db.rpc('auth_reset_failures', { p_identifier: identifier });
    await writeAudit(db, {
      actorLabel: input.username, actorRole: profile.role,
      entityType: 'auth', entityId: profile.id, action: 'login', ip, userAgent: ua,
    });

    return json({
      session: auth.session,
      role: profile.role,
      displayName: profile.display_name,
      mustChangePassword: false,
      redirect: profile.role === 'super_admin' ? '/admin/global-board' : '/schedules',
    }, 200);
  }

  await db.rpc('auth_reset_failures', { p_identifier: identifier });
  await writeAudit(db, {
    actorLabel: student.full_name, actorRole: 'student', scheduleId: student.schedule_id,
    entityType: 'auth', entityId: student.id, action: 'login', ip, userAgent: ua,
  });

  return json({
    session: auth.session,
    role: 'student',
    displayName: student.full_name,
    mustChangePassword: student.must_change_password,
    redirect: student.must_change_password ? '/change-password' : '/today',
  }, 200);
}
```

Note the ordering: origin check, shape validation, IP throttle, lockout, identifier throttle,
then and only then a credential check. Every failure path returns the identical `GENERIC`
message, and the student path verifies schedule membership **before** attempting a sign-in so
a valid PIN from another schedule cannot be replayed through someone else's link.

- [ ] **Step 6: Run the login test to verify it passes**

```bash
npm test -- tests/api/login.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/validation lib/audit app/api/auth tests/api
git commit -m "feat(auth): hardened login route with rate limiting, lockout, and audit"
```

---

### Task 12: Join link, student picker, and login screens

**Files:**
- Create: `app/api/join/[slug]/route.js`
- Create: `app/(auth)/j/[slug]/page.js`, `app/(auth)/j/[slug]/StudentLogin.js`
- Create: `app/(auth)/login/page.js`, `app/(auth)/login/StaffLogin.js`
- Create: `components/ui/Button.js`, `components/ui/Field.js`, `components/ui/PinInput.js`, `components/ui/Skeleton.js`, `components/ui/Toast.js`
- Create: `lib/auth/session.js`
- Test: `tests/api/join.test.js`, `tests/ui/pin-input.test.js`

**Interfaces:**
- Consumes: Task 11's `POST /api/auth/login`; Task 10's clients.
- Produces:
  - `GET /api/join/:slug` → `200 { schedule: { name }, groups: [{ id, name }], students: [{ id, full_name, group_id }] }` or `404 { error }`. Returns **names only** — never PINs, never `auth_uid`.
  - `lib/auth/session.js` exporting `applySession(session)`, `getStoredRole()`, `signOut()`, `useSession()`.
  - `<PinInput value onChange length={6} />` — six single-digit boxes, LTR digit flow inside an RTL page, auto-advance, paste support, `inputMode="numeric"`.
  - `<Skeleton className />`, `<Button variant tone loading />`, `<Field label error hint />`, `useToast()`.

- [ ] **Step 1: Write the failing join-endpoint test**

Create `tests/api/join.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc, from }),
  createRequestClient: () => ({ rpc, from }),
}));

const { GET } = await import('@/app/api/join/[slug]/route');

const get = (slug) =>
  GET(new Request(`https://qawafel.app/api/join/${slug}`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true });
  from.mockReset();
});

describe('GET /api/join/:slug', () => {
  it('rejects a slug that does not match the allowed shape', async () => {
    expect((await get('../../etc/passwd')).status).toBe(400);
    expect((await get('SHORT')).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown slug without revealing whether schedules exist', async () => {
    from.mockReturnValue({
      select: () => ({ or: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    });
    const res = await get('abcdefghij');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('الرابط غير صالح');
  });

  it('returns only names, ids, and group labels for a valid link', async () => {
    from.mockImplementation((table) => {
      if (table === 'schedules') {
        return { select: () => ({ or: () => ({ maybeSingle: () => Promise.resolve({
          data: { id: 'sch1', name: 'رحلة الصيف', status: 'active' },
        }) }) }) };
      }
      if (table === 'groups') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({
          data: [{ id: 'g1', name: 'غرفة 101' }],
        }) }) }) };
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({
        data: [{ id: 's1', full_name: 'محمد علي', group_id: 'g1' }],
      }) }) }) }) };
    });

    const body = await (await get('abcdefghij')).json();
    expect(body.schedule.name).toBe('رحلة الصيف');
    expect(body.students).toEqual([{ id: 's1', full_name: 'محمد علي', group_id: 'g1' }]);
    expect(JSON.stringify(body)).not.toMatch(/auth_uid|pin|password/i);
  });

  it('throttles by IP', async () => {
    rpc.mockResolvedValue({ data: false });
    expect((await get('abcdefghij')).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the route**

```bash
npm test -- tests/api/join.test.js
```

Expected: FAIL — module not found.

Create `app/api/join/[slug]/route.js`:

```js
import { createServiceClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/http/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_RE = /^[0-9a-z]{10,32}$/;

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function GET(request, { params }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug ?? '')) return json({ error: 'الرابط غير صالح' }, 400);

  const db = createServiceClient();
  const gate = await db.rpc('rl_hit', {
    p_key: `join:${clientIp(request) || 'unknown'}`, p_limit: 60, p_window_seconds: 300,
  });
  if (gate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  // A slug may name a whole schedule or a single group inside one.
  const { data: schedule } = await db
    .from('schedules')
    .select('id, name, status, groups!left(id)')
    .or(`slug.eq.${slug},groups.join_slug.eq.${slug}`)
    .maybeSingle();

  if (!schedule) return json({ error: 'الرابط غير صالح' }, 404);

  const { data: groupRow } = await db
    .from('groups').select('id').eq('join_slug', slug).maybeSingle();

  const { data: groups } = await db
    .from('groups').select('id, name').eq('schedule_id', schedule.id).order('sort_order');

  let query = db
    .from('students')
    .select('id, full_name, group_id')
    .eq('schedule_id', schedule.id)
    .eq('is_active', true);
  if (groupRow) query = query.eq('group_id', groupRow.id);

  const { data: students } = await query.order('sort_order').order('full_name');

  return json({
    schedule: { name: schedule.name, archived: schedule.status === 'archived' },
    groups: groupRow ? (groups ?? []).filter((g) => g.id === groupRow.id) : (groups ?? []),
    students: students ?? [],
  }, 200);
}
```

The response deliberately omits `schedule.id`: the client never needs it, and withholding it
keeps the public surface to display data only.

- [ ] **Step 3: Build the UI primitives**

Create `components/ui/Skeleton.js`:

```js
export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-line/70 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonList({ rows = 5, className = 'h-14' }) {
  return (
    <div className="space-y-2" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={className} />)}
    </div>
  );
}
```

Create `components/ui/Button.js`:

```js
'use client';

const TONES = {
  primary: 'bg-navy-700 text-white hover:bg-navy-600 disabled:bg-navy-300',
  gold: 'bg-gold-500 text-navy-900 hover:bg-gold-300 disabled:opacity-50',
  ghost: 'bg-transparent text-navy-700 hover:bg-navy-50 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50',
};

export function Button({ tone = 'primary', loading = false, children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 font-semibold transition disabled:cursor-not-allowed ${TONES[tone]} ${className}`}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}
```

Create `components/ui/Field.js`:

```js
export function Field({ label, error, hint, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing PIN input test**

Create `tests/ui/pin-input.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinInput } from '@/components/ui/PinInput';

function Harness({ onChange = () => {} }) {
  return <PinInput value="" onChange={onChange} length={6} label="الرمز" />;
}

describe('PinInput', () => {
  it('renders one numeric box per digit', () => {
    render(<Harness />);
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAttribute('inputmode', 'numeric');
  });

  it('accepts digits and reports the assembled value', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getAllByRole('textbox')[0], '4');
    expect(onChange).toHaveBeenCalledWith('4');
  });

  it('ignores non-digit characters', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getAllByRole('textbox')[0], 'a');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts a pasted six-digit code', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const first = screen.getAllByRole('textbox')[0];
    first.focus();
    await userEvent.paste('482913');
    expect(onChange).toHaveBeenCalledWith('482913');
  });

  it('strips non-digits from a pasted string', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getAllByRole('textbox')[0].focus();
    await userEvent.paste('48-29-13');
    expect(onChange).toHaveBeenCalledWith('482913');
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then implement**

```bash
npm test -- tests/ui/pin-input.test.js
```

Expected: FAIL — module not found.

Create `components/ui/PinInput.js`:

```js
'use client';

import { useRef } from 'react';

export function PinInput({ value = '', onChange, length = 6, label, disabled = false }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const emit = (next) => onChange(next.join('').trimEnd());

  function handleChange(index, raw) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    const next = [...digits];
    next[index] = digit;
    emit(next);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key !== 'Backspace') return;
    event.preventDefault();

    const next = [...digits];
    if (next[index] !== ' ') {
      next[index] = ' ';
    } else if (index > 0) {
      next[index - 1] = ' ';
      refs.current[index - 1]?.focus();
    }
    emit(next);
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    emit(pasted.padEnd(length, ' ').split(''));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" dir="ltr" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          role="textbox"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          aria-label={`${label} - الخانة ${index + 1}`}
          value={digit.trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="size-12 rounded-xl border border-line bg-panel text-center text-xl font-bold text-ink focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/30"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement session storage helpers**

Create `lib/auth/session.js`:

```js
'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

const ROLE_KEY = 'qawafel.role';

export async function applySession({ session, role, displayName }) {
  await getBrowserClient().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  window.localStorage.setItem(ROLE_KEY, JSON.stringify({ role, displayName }));
}

export function getStoredRole() {
  try {
    return JSON.parse(window.localStorage.getItem(ROLE_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function signOut() {
  await getBrowserClient().auth.signOut();
  window.localStorage.removeItem(ROLE_KEY);
  const { clearMirror } = await import('@/lib/offline/db');
  await clearMirror();
  window.location.href = '/login';
}
```

`lib/offline/db.js` is created in Task 17; import it dynamically so this module does not
depend on it existing yet. Until Task 17 lands, add a temporary stub
`export async function clearMirror() {}` in `lib/offline/db.js`.

- [ ] **Step 7: Build the two login screens**

Create `app/(auth)/j/[slug]/page.js` — a server component that renders `<StudentLogin slug={slug} />` inside a centred card, with `<SkeletonList rows={4} />` as its `Suspense` fallback.

Create `app/(auth)/j/[slug]/StudentLogin.js` (client component):
- On mount, `fetch('/api/join/' + slug)`; while pending render `<SkeletonList rows={5} />`.
- Show the schedule name, an optional group filter chip row, and a searchable student list (an `<input type="search">` filtering `full_name` client-side — necessary at 200 students).
- Selecting a name reveals `<PinInput>` and a **دخول** button.
- Submit posts to `/api/auth/login` with `{ mode: 'student', studentId, pin, slug }`, then calls `applySession(...)` and `router.replace(body.redirect)`.
- On a non-200, show `body.error` in a `role="alert"` region and clear the PIN.
- If `schedule.archived`, render a notice and disable the form.

Create `app/(auth)/login/StaffLogin.js` (client component): username + password fields, posts `{ mode: 'staff', username, password }`, same session handling, redirects to `body.redirect`.

- [ ] **Step 8: Run the suite and commit**

```bash
npm test && npm run lint && npm run build
```

Expected: all green.

```bash
git add app components lib/auth/session.js tests/api/join.test.js tests/ui
git commit -m "feat(auth): join-link student picker, PIN input, and staff login screens"
```

---

### Task 13: Forced and voluntary password change

**Files:**
- Create: `app/api/auth/change-password/route.js`, `app/(auth)/change-password/page.js`, `app/(auth)/change-password/ChangePasswordForm.js`
- Test: `tests/api/change-password.test.js`

**Interfaces:**
- Consumes: `changePasswordSchema` (Task 11), `validateStudentPin` / `validateStaffPassword` (Task 5), `bearerToken` (Task 10).
- Produces: `POST /api/auth/change-password` accepting `{ currentPassword, newPassword }` with the caller's bearer token, returning `200 { ok: true }` or an error. Clears `students.must_change_password` on success.

- [ ] **Step 1: Write the failing test**

Create `tests/api/change-password.test.js` covering, with the same mocking approach as Task 11:

1. `403` when the request is cross-site.
2. `401` when the `Authorization` header is missing or malformed.
3. `400` when the new PIN is not six digits (student) — assert the response carries the Arabic policy message from `validateStudentPin`.
4. `400` when a staff password is under eight characters or single-class.
5. `400` when `newPassword === currentPassword`.
6. `401` when the current password fails re-authentication, with `auth_record_failure` called.
7. `429` when the per-user rate limit (5 per hour) is exhausted.
8. `200` on success, asserting `auth.admin.updateUserById` was called, `must_change_password` was set to `false` for a student, and an audit entry with `action: 'password_change'` was written **without** either password value in `before`/`after`.

Assertion for the last point:

```js
const auditCall = rpc.mock.calls.find(([name]) => name === 'write_audit');
expect(JSON.stringify(auditCall[1])).not.toMatch(/482913|Qawafel!2026/);
```

- [ ] **Step 2: Run it to verify it fails, then implement the route**

The handler must, in order: check `sameOrigin`; extract and verify the bearer token via
`createRequestClient(token).auth.getUser()`; rate-limit on `pwchange:{userId}`; determine
whether the caller is a student or staff by querying `students.auth_uid` then `app_users.id`;
validate the new secret with the matching policy function; re-authenticate by calling
`signInWithPassword` with the **current** password; call
`createServiceClient().auth.admin.updateUserById(userId, { password: newPassword })`; set
`must_change_password = false` for students; write the audit entry; return `{ ok: true }`.

Never log, echo, or store either password value.

- [ ] **Step 3: Build the form**

`ChangePasswordForm.js` renders `<PinInput>` twice (new PIN, confirm PIN) for students, or two password fields for staff, chosen from `getStoredRole()`. Show the policy text inline as a hint. On success call `signOut()` — forcing a fresh login with the new secret proves it took effect — and route to the appropriate login page.

- [ ] **Step 4: Run the suite and commit**

```bash
npm test -- tests/api/change-password.test.js
```

Expected: PASS, 8 tests.

```bash
git add app/api/auth/change-password app/\(auth\)/change-password tests/api/change-password.test.js
git commit -m "feat(auth): forced and voluntary password change with re-authentication"
```

---

### Task 14: Route guards and role-based shells

**Files:**
- Create: `lib/auth/guard.js`, `components/auth/RequireRole.js`
- Create: `app/(student)/layout.js`, `app/(manage)/layout.js`, `app/(admin)/layout.js`
- Modify: `app/page.js`
- Test: `tests/auth/guard.test.js`

**Interfaces:**
- Produces:
  - `homeFor(role) -> string` — `'/today'` | `'/schedules'` | `'/admin/global-board'`
  - `canAccess(role, pathname) -> boolean`
  - `<RequireRole allow={['manager','super_admin']}>` — client component that reads the Supabase session, verifies the role, and redirects when it does not match, rendering a skeleton while resolving.

- [ ] **Step 1: Write the failing guard test**

Create `tests/auth/guard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { homeFor, canAccess } from '@/lib/auth/guard';

describe('homeFor', () => {
  it('routes each role to its landing page', () => {
    expect(homeFor('student')).toBe('/today');
    expect(homeFor('manager')).toBe('/schedules');
    expect(homeFor('super_admin')).toBe('/admin/global-board');
  });

  it('sends an unknown or missing role to the staff login', () => {
    expect(homeFor(null)).toBe('/login');
    expect(homeFor('intruder')).toBe('/login');
  });
});

describe('canAccess', () => {
  it('keeps a student inside the student area', () => {
    expect(canAccess('student', '/today')).toBe(true);
    expect(canAccess('student', '/board')).toBe(true);
    expect(canAccess('student', '/schedules')).toBe(false);
    expect(canAccess('student', '/admin/global-log')).toBe(false);
  });

  it('lets a manager into the management area but not the admin area', () => {
    expect(canAccess('manager', '/schedules')).toBe(true);
    expect(canAccess('manager', '/questions')).toBe(true);
    expect(canAccess('manager', '/admin/staff')).toBe(false);
  });

  it('lets a super admin everywhere', () => {
    for (const path of ['/today', '/schedules', '/admin/staff', '/admin/global-log']) {
      expect(canAccess('super_admin', path)).toBe(true);
    }
  });

  it('allows the auth routes to every role including none', () => {
    for (const role of ['student', 'manager', 'super_admin', null]) {
      expect(canAccess(role, '/login')).toBe(true);
      expect(canAccess(role, '/change-password')).toBe(true);
      expect(canAccess(role, '/j/abcdefghij')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Create `lib/auth/guard.js`:

```js
const PUBLIC_PREFIXES = ['/login', '/change-password', '/j/'];
const STUDENT_PREFIXES = ['/today', '/board', '/settings'];
const MANAGE_PREFIXES = ['/schedules', '/students', '/questions', '/grading', '/boards', '/export', '/log'];
const ADMIN_PREFIX = '/admin';

const startsWithAny = (path, prefixes) => prefixes.some((p) => path === p || path.startsWith(p));

export function homeFor(role) {
  if (role === 'student') return '/today';
  if (role === 'manager') return '/schedules';
  if (role === 'super_admin') return '/admin/global-board';
  return '/login';
}

export function canAccess(role, pathname) {
  if (startsWithAny(pathname, PUBLIC_PREFIXES)) return true;
  if (role === 'super_admin') return true;
  if (role === 'student') return startsWithAny(pathname, STUDENT_PREFIXES);
  if (role === 'manager') return startsWithAny(pathname, MANAGE_PREFIXES);
  return false;
}
```

Authorization is enforced by RLS in the database; `canAccess` only decides what to render,
so a bypass here leaks no data.

- [ ] **Step 3: Build RequireRole and the three layouts**

`components/auth/RequireRole.js` (client): on mount, read `getBrowserClient().auth.getSession()`. While resolving, render `<SkeletonList rows={6} />`. If there is no session, `router.replace('/login')`. If `getStoredRole()` is absent or fails `canAccess`, `router.replace(homeFor(role))`. Otherwise render children.

The three layouts wrap their children in `<RequireRole allow={...}>` and add the appropriate chrome: student → bottom navigation (اليوم / الصدارة / الإعدادات) plus `<OfflineBanner />` (Task 17); manage → a top bar with the schedule switcher and a horizontal tab strip; admin → the manage chrome plus admin-only tabs.

`app/page.js` becomes a client component that redirects to `homeFor(getStoredRole()?.role)`.

- [ ] **Step 4: Run the suite and commit**

```bash
npm test && npm run build
```

```bash
git add lib/auth/guard.js components/auth app tests/auth/guard.test.js
git commit -m "feat(auth): role-based route guards and per-area layouts"
```

---

## Phase 4 — Student flow

### Task 15: Question renderers

**Files:**
- Create: `components/questions/BoolQuestion.js`, `PerPrayerQuestion.js`, `SingleChoiceQuestion.js`, `MultiChoiceQuestion.js`, `CounterQuestion.js`, `RatingQuestion.js`, `TextQuestion.js`, `QuestionCard.js`, `index.js`
- Test: `tests/ui/question-renderers.test.js`

**Interfaces:**
- Consumes: `PRAYERS`, `PRAYER_LABELS` (Task 2); `scoreAnswer`, `maxPoints` (Task 3).
- Produces: `RENDERERS` — a frozen map from `question.type` to a component with the uniform prop contract:

```js
{
  question,            // { id, title, help_text, type, config, points }
  value,               // current value, or undefined
  onChange,            // (nextValue) => void — fired on every interaction
  disabled,            // boolean — true for archived schedules and out-of-window days
}
```

- Produces: `<QuestionCard question value onChange disabled />` which picks the renderer, shows the title, help text, and an earned/max points chip, and renders a `<Skeleton>` for an unknown type instead of throwing.

- [ ] **Step 1: Write the failing renderer test**

Create `tests/ui/question-renderers.test.js`. One `describe` per type, each asserting:

- The control renders with an accessible name equal to `question.title`.
- Interacting calls `onChange` with the correct value shape for that type — `true` for bool, `{ fajr: true }` for per-prayer, the option `id` for single choice, an array for multi choice, a number for counter and rating, a string for text.
- `disabled` blocks interaction: after a click, `onChange` was not called.
- The points chip shows `scoreAnswer(...) / maxPoints(...)`.

For `MultiChoiceQuestion`, include a test that toggling an already-selected option removes it from the array rather than duplicating it:

```js
it('removes an option that is toggled off', async () => {
  const onChange = vi.fn();
  render(<MultiChoiceQuestion question={multiQ} value={['a', 'b']} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('أ'));
  expect(onChange).toHaveBeenCalledWith(['b']);
});
```

For `PerPrayerQuestion`, include a test that only the prayers named in `config.prayers` render:

```js
it('renders only the configured prayers', () => {
  render(<PerPrayerQuestion question={{ ...prayerQ, config: { prayers: ['fajr', 'isha'], points_per_prayer: 2 } }} value={{}} onChange={() => {}} />);
  expect(screen.getByLabelText('الفجر')).toBeInTheDocument();
  expect(screen.queryByLabelText('العصر')).not.toBeInTheDocument();
});
```

For `CounterQuestion`, include a test that the increment button stops at `config.max` and the decrement button stops at zero.

For `RatingQuestion`, include a test that the stars are keyboard-operable (`role="radiogroup"` with arrow-key navigation), not click-only.

- [ ] **Step 2: Run it to verify it fails, then implement each renderer**

```bash
npm test -- tests/ui/question-renderers.test.js
```

Expected: FAIL — modules not found.

Implementation notes that the tests pin down:

- Every control is at least 44px on its shortest side.
- `BoolQuestion` is a single large tappable row, not a bare checkbox — the whole row is the label.
- `CounterQuestion` uses `−` / `+` buttons plus a read-only numeric display; there is no free-text number entry, so no parsing edge cases reach `onChange`.
- `RatingQuestion` renders `role="radiogroup"` with one `role="radio"` per star and handles `ArrowRight`/`ArrowLeft`.
- `TextQuestion` uses a `<textarea>` with `maxLength={config.max_length}` and a live character counter.
- No renderer calls `dangerouslySetInnerHTML`; all labels are text children.

Create `components/questions/index.js`:

```js
import { BoolQuestion } from './BoolQuestion';
import { PerPrayerQuestion } from './PerPrayerQuestion';
import { SingleChoiceQuestion } from './SingleChoiceQuestion';
import { MultiChoiceQuestion } from './MultiChoiceQuestion';
import { CounterQuestion } from './CounterQuestion';
import { RatingQuestion } from './RatingQuestion';
import { TextQuestion } from './TextQuestion';

export const RENDERERS = Object.freeze({
  bool: BoolQuestion,
  per_prayer: PerPrayerQuestion,
  single_choice: SingleChoiceQuestion,
  multi_choice: MultiChoiceQuestion,
  counter: CounterQuestion,
  rating: RatingQuestion,
  text: TextQuestion,
});

export { QuestionCard } from './QuestionCard';
```

- [ ] **Step 3: Run the test, then commit**

```bash
npm test -- tests/ui/question-renderers.test.js
```

Expected: PASS.

```bash
git add components/questions tests/ui/question-renderers.test.js
git commit -m "feat(student): accessible renderers for all seven question types"
```

---

### Task 16: Offline store, outbox, and sync engine

Build this **before** the daily sheet so the sheet can be written against the offline store from the start rather than retrofitted.

**Files:**
- Create: `lib/offline/db.js`, `lib/offline/outbox.js`, `lib/offline/sync.js`, `lib/offline/useOnline.js`
- Create: `components/offline/OfflineBanner.js`
- Modify: `lib/auth/session.js` (replace the temporary `clearMirror` stub import)
- Test: `tests/offline/outbox.test.js`, `tests/offline/sync.test.js`

**Interfaces:**
- Produces (`lib/offline/db.js`): a Dexie database `qawafel` version 1 with stores
  - `meta` — `key` (primary), `value`
  - `questions` — `id`, index `schedule_id`
  - `answers` — compound primary key `[student_id+question_id+entry_date]`, index `entry_date`
  - `outbox` — `++seq`, unique index `key` where `key = student_id|question_id|entry_date`
  - plus `clearMirror()`.
- Produces (`lib/offline/outbox.js`):
  - `enqueue({ studentId, questionId, entryDate, value, clientUpdatedAt, deviceId }) -> Promise<void>` — **replaces** any queued op with the same key
  - `pending() -> Promise<Array<Op>>` ordered by `seq`
  - `pendingCount() -> Promise<number>`
  - `remove(seq) -> Promise<void>`
- Produces (`lib/offline/sync.js`):
  - `flush(client) -> Promise<{ pushed, rejected: Array<{ op, error }> }>`
  - `mirror(client, { studentId, scheduleId, days }) -> Promise<void>`
  - `startAutoSync(client)` — flushes on `online`, on `visibilitychange`, and every 60s while online; returns a teardown function.

- [ ] **Step 1: Write the failing outbox test**

Create `tests/offline/outbox.test.js`. Install the in-memory IndexedDB shim first:

```bash
npm install -D fake-indexeddb
```

Add `import 'fake-indexeddb/auto';` to the top of `vitest.setup.js`.

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearMirror } from '@/lib/offline/db';
import { enqueue, pending, pendingCount, remove } from '@/lib/offline/outbox';

const op = (over = {}) => ({
  studentId: 's1', questionId: 'q1', entryDate: '2026-08-01',
  value: true, clientUpdatedAt: '2026-08-01T10:00:00.000Z', deviceId: 'dev', ...over,
});

beforeEach(async () => { await clearMirror(); });

describe('outbox', () => {
  it('queues an operation and reports it as pending', async () => {
    await enqueue(op());
    expect(await pendingCount()).toBe(1);
    expect((await pending())[0].value).toBe(true);
  });

  it('replaces rather than stacks when the same item is tapped again', async () => {
    await enqueue(op({ value: true, clientUpdatedAt: '2026-08-01T10:00:00.000Z' }));
    await enqueue(op({ value: false, clientUpdatedAt: '2026-08-01T10:00:05.000Z' }));

    const queued = await pending();
    expect(queued).toHaveLength(1);
    expect(queued[0].value).toBe(false);
    expect(queued[0].clientUpdatedAt).toBe('2026-08-01T10:00:05.000Z');
  });

  it('keeps operations for different days separate', async () => {
    await enqueue(op({ entryDate: '2026-08-01' }));
    await enqueue(op({ entryDate: '2026-08-02' }));
    expect(await pendingCount()).toBe(2);
  });

  it('keeps operations for different questions separate', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    expect(await pendingCount()).toBe(2);
  });

  it('preserves insertion order across distinct keys', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    expect((await pending()).map((o) => o.questionId)).toEqual(['q1', 'q2']);
  });

  it('removes a single operation by sequence number', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    const [first] = await pending();
    await remove(first.seq);
    expect((await pending()).map((o) => o.questionId)).toEqual(['q2']);
  });

  it('writes the value into the local answers mirror immediately', async () => {
    await enqueue(op({ value: true }));
    const local = await db.answers.get(['s1', 'q1', '2026-08-01']);
    expect(local.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the store**

```bash
npm test -- tests/offline/outbox.test.js
```

Expected: FAIL — module not found.

Create `lib/offline/db.js`:

```js
import Dexie from 'dexie';

export const db = new Dexie('qawafel');

db.version(1).stores({
  meta: 'key',
  questions: 'id, schedule_id',
  answers: '[student_id+question_id+entry_date], entry_date, student_id',
  outbox: '++seq, &key',
});

export const outboxKey = (studentId, questionId, entryDate) =>
  `${studentId}|${questionId}|${entryDate}`;

export async function clearMirror() {
  await db.transaction('rw', db.meta, db.questions, db.answers, db.outbox, async () => {
    await Promise.all([db.meta.clear(), db.questions.clear(), db.answers.clear(), db.outbox.clear()]);
  });
}
```

Create `lib/offline/outbox.js`:

```js
import { db, outboxKey } from './db';

/**
 * Queue a change and reflect it in the local mirror at once.
 * Re-tapping the same item overwrites its queued op instead of adding another,
 * so a student toggling a checkbox ten times offline still syncs one write.
 */
export async function enqueue({ studentId, questionId, entryDate, value, clientUpdatedAt, deviceId }) {
  const key = outboxKey(studentId, questionId, entryDate);

  await db.transaction('rw', db.outbox, db.answers, async () => {
    const existing = await db.outbox.where('key').equals(key).first();
    const record = {
      key,
      studentId,
      questionId,
      entryDate,
      value,
      clientUpdatedAt,
      deviceId,
    };

    if (existing) {
      await db.outbox.update(existing.seq, record);
    } else {
      await db.outbox.add(record);
    }

    await db.answers.put({
      student_id: studentId,
      question_id: questionId,
      entry_date: entryDate,
      value,
      client_updated_at: clientUpdatedAt,
      dirty: true,
    });
  });
}

export function pending() {
  return db.outbox.orderBy('seq').toArray();
}

export function pendingCount() {
  return db.outbox.count();
}

export function remove(seq) {
  return db.outbox.delete(seq);
}
```

- [ ] **Step 3: Write the failing sync test**

Create `tests/offline/sync.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearMirror } from '@/lib/offline/db';
import { enqueue, pendingCount } from '@/lib/offline/outbox';
import { flush } from '@/lib/offline/sync';

function fakeClient(behaviour) {
  return {
    from: () => ({
      upsert: (rows) => Promise.resolve(behaviour(rows)),
    }),
  };
}

const op = (over = {}) => ({
  studentId: 's1', questionId: 'q1', entryDate: '2026-08-01',
  value: true, clientUpdatedAt: '2026-08-01T10:00:00.000Z', deviceId: 'dev', ...over,
});

beforeEach(async () => { await clearMirror(); });

describe('flush', () => {
  it('pushes every queued op and empties the outbox on success', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));

    const result = await flush(fakeClient(() => ({ error: null })));

    expect(result.pushed).toBe(2);
    expect(result.rejected).toEqual([]);
    expect(await pendingCount()).toBe(0);
  });

  it('clears the dirty flag on synced rows', async () => {
    await enqueue(op());
    await flush(fakeClient(() => ({ error: null })));
    const row = await db.answers.get(['s1', 'q1', '2026-08-01']);
    expect(row.dirty).toBe(false);
  });

  it('keeps an op queued when the push fails with a network error', async () => {
    await enqueue(op());
    const result = await flush(fakeClient(() => ({ error: { message: 'Failed to fetch' } })));

    expect(result.pushed).toBe(0);
    expect(await pendingCount()).toBe(1);
  });

  it('drops an op the server rejects on business rules and reports it', async () => {
    await enqueue(op());
    const result = await flush(
      fakeClient(() => ({ error: { code: 'P0001', message: 'انتهت مهلة التعديل على هذا اليوم' } })),
    );

    expect(result.pushed).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].error).toMatch(/انتهت مهلة/);
    expect(await pendingCount()).toBe(0);
  });

  it('is a no-op with an empty outbox', async () => {
    const upsert = vi.fn();
    const result = await flush({ from: () => ({ upsert }) });
    expect(result).toEqual({ pushed: 0, rejected: [] });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never runs two flushes concurrently', async () => {
    await enqueue(op());
    let inflight = 0;
    let overlapped = false;
    const client = fakeClient(() => {
      inflight += 1;
      if (inflight > 1) overlapped = true;
      inflight -= 1;
      return { error: null };
    });

    await Promise.all([flush(client), flush(client)]);
    expect(overlapped).toBe(false);
  });
});
```

- [ ] **Step 4: Run it to verify it fails, then implement sync**

```bash
npm test -- tests/offline/sync.test.js
```

Expected: FAIL — module not found.

Create `lib/offline/sync.js`:

```js
import { db } from './db';
import { pending, remove } from './outbox';

let flushing = null;

/** Postgres raises business-rule violations as P0001; those will never succeed on retry. */
const isPermanent = (error) =>
  error?.code === 'P0001' || error?.code === '23514' || error?.code === '42501';

export async function flush(client) {
  if (flushing) return flushing;

  flushing = (async () => {
    const ops = await pending();
    if (ops.length === 0) return { pushed: 0, rejected: [] };

    let pushed = 0;
    const rejected = [];

    for (const op of ops) {
      const { error } = await client.from('answers').upsert(
        {
          student_id: op.studentId,
          question_id: op.questionId,
          entry_date: op.entryDate,
          value: op.value,
          client_updated_at: op.clientUpdatedAt,
          device_id: op.deviceId,
        },
        { onConflict: 'student_id,question_id,entry_date' },
      );

      if (!error) {
        await remove(op.seq);
        await db.answers.update([op.studentId, op.questionId, op.entryDate], { dirty: false });
        pushed += 1;
      } else if (isPermanent(error)) {
        await remove(op.seq);
        rejected.push({ op, error: error.message });
      } else {
        break; // transient: stop here and keep the queue ordered for the next attempt
      }
    }

    return { pushed, rejected };
  })();

  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

export async function mirror(client, { studentId, scheduleId, days }) {
  const [{ data: questions }, { data: answers }] = await Promise.all([
    client.from('questions').select('*').eq('schedule_id', scheduleId),
    client.from('answers').select('*').eq('student_id', studentId).gte('entry_date', days.from),
  ]);

  await db.transaction('rw', db.questions, db.answers, async () => {
    if (questions) await db.questions.bulkPut(questions);
    if (answers) {
      // Never clobber a row that still has an unsynced local edit.
      for (const row of answers) {
        const local = await db.answers.get([row.student_id, row.question_id, row.entry_date]);
        if (local?.dirty) continue;
        await db.answers.put({ ...row, dirty: false });
      }
    }
  });
}

export function startAutoSync(client) {
  const run = () => { if (navigator.onLine) flush(client).catch(() => {}); };

  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  const timer = setInterval(run, 60_000);
  run();

  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
    clearInterval(timer);
  };
}
```

Stopping the loop on a transient error rather than continuing keeps the queue in order, so a
later edit to the same field can never land before an earlier one.

- [ ] **Step 5: Build the online hook and banner**

`lib/offline/useOnline.js` exports `useOnline()` returning `navigator.onLine`, kept current by `online`/`offline` listeners, defaulting to `true` during SSR.

`components/offline/OfflineBanner.js` renders nothing when online with an empty queue; an amber bar reading `تعمل الآن بدون إنترنت — التغييرات محفوظة وسترفع تلقائياً` when offline; and a navy bar reading `جارٍ المزامنة… (N)` when online with `pendingCount() > 0`.

- [ ] **Step 6: Replace the clearMirror stub and run the suite**

```bash
npm test -- tests/offline
```

Expected: PASS, 13 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/offline components/offline tests/offline vitest.setup.js package.json package-lock.json
git commit -m "feat(offline): IndexedDB mirror, deduplicating outbox, and sync engine"
```

---

### Task 17: Daily sheet

**Files:**
- Create: `app/(student)/today/page.js`, `app/(student)/today/DailySheet.js`, `app/(student)/today/DateStrip.js`, `app/(student)/today/DayHeader.js`
- Create: `components/ui/ProgressRing.js`
- Create: `lib/student/useDay.js`
- Test: `tests/student/use-day.test.js`

**Interfaces:**
- Consumes: Task 15 renderers, Task 16 offline store, Tasks 3–5 domain logic.
- Produces: `useDay({ studentId, schedule, dayKey })` returning
  `{ questions, values, setValue, completion, streak, loading, editable, pendingCount }`.
  `setValue` writes optimistically to Dexie via `enqueue` and triggers a flush when online — the UI never awaits the network.

- [ ] **Step 1: Write the failing hook test**

Create `tests/student/use-day.test.js` using `renderHook` from `@testing-library/react` with the offline modules mocked. Cover:

1. Returns `loading: true` on first render, then the day's active questions sorted by `sort_order`.
2. Filters out questions inactive on that date (weekday and date-range rules).
3. `setValue` updates `values` synchronously, before any promise resolves — the optimistic path.
4. `completion` recomputes from the new value without a refetch.
5. `editable` is `false` when the day falls outside the backfill window, and `setValue` is then a no-op.
6. `editable` is `false` when `schedule.status === 'archived'`.
7. A server rejection surfaced by `flush` rolls the value back to its previous state and reports the message.

The rollback assertion:

```js
it('rolls a value back when the server rejects it', async () => {
  flushMock.mockResolvedValue({ pushed: 0, rejected: [{ op: { questionId: 'q1' }, error: 'انتهت مهلة التعديل على هذا اليوم' }] });
  const { result } = renderHook(() => useDay(args));
  await act(() => result.current.setValue('q1', true));
  await waitFor(() => expect(result.current.values.q1).toBeUndefined());
  expect(result.current.error).toMatch(/انتهت مهلة/);
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the hook**

Implementation contract:
- Reads questions and answers from Dexie first (instant, works offline), then calls `mirror()` in the background and re-reads.
- `setValue(questionId, value)` sets local React state immediately, calls `enqueue(...)` with `clientUpdatedAt: new Date().toISOString()` and a `deviceId` persisted in `db.meta`, then calls `flush()` when `navigator.onLine`.
- Rejections from `flush` restore the previous value and set `error`.
- `completion` comes from `completionPct(activeQuestions, values)`; `streak` from `currentStreak(...)` over the mirrored answers.
- `editable` is `isWithinBackfill(schedule, dayKey) && schedule.status === 'active'`.

- [ ] **Step 3: Build the screen**

`DateStrip.js` — a horizontally scrolling row of the last 14 days plus today, right-to-left, each chip showing the weekday abbreviation and day number, tinted by that day's completion, with days outside the backfill window rendered muted and non-interactive. `«` / `»` buttons step one day.

`DayHeader.js` — `<ProgressRing value={completion} />`, the streak flame with `streak` days, and the day's earned/possible points.

`DailySheet.js` — groups active questions by `section`, renders a `<QuestionCard>` per question, and shows `<SkeletonList rows={8} />` while `loading`. Each card's `onChange` calls `setValue`.

`ProgressRing.js` — an SVG ring with `role="img"` and `aria-label={`نسبة الإنجاز ${value}٪`}`, animating `stroke-dashoffset`.

- [ ] **Step 4: Run the suite and verify in the browser**

```bash
npm test && npm run build
```

Then run the dev server and confirm by hand: tick several items, open DevTools → Application → IndexedDB and see the rows; switch to offline in the Network panel, tick more, reload the page and confirm the ticks survive; go back online and watch the outbox drain.

- [ ] **Step 5: Commit**

```bash
git add app/\(student\)/today components/ui/ProgressRing.js lib/student tests/student
git commit -m "feat(student): offline-first daily sheet with optimistic ticks"
```

---

### Task 18: Student leaderboard and settings

**Files:**
- Create: `app/(student)/board/page.js`, `app/(student)/board/StudentBoard.js`
- Create: `app/(student)/settings/page.js`
- Create: `lib/boards/queries.js`
- Create: `supabase/migrations/0006_views.sql`
- Test: `tests/db/views.test.js`

**Interfaces:**
- Produces (SQL views, used by every leaderboard from here on):
  - `v_student_totals` — `student_id, schedule_id, group_id, full_name, group_name, schedule_name, answer_points, grant_points, total_points`
  - `v_group_totals` — `group_id, schedule_id, group_name, member_count, total_points, avg_points`
  - `v_question_totals` — `student_id, question_id, schedule_id, times_completed, points`
- Produces (`lib/boards/queries.js`): `fetchStudentTotals(client, { scheduleId, groupId, from, to })`, `fetchGroupTotals(client, { scheduleId })`, `fetchQuestionLeaders(client, { scheduleId, questionId, limit })`.

- [ ] **Step 1: Write the views migration**

Create `supabase/migrations/0006_views.sql`:

```sql
create or replace view v_student_totals
with (security_invoker = on) as
select
  s.id                       as student_id,
  s.schedule_id,
  s.group_id,
  s.full_name,
  g.name                     as group_name,
  sc.name                    as schedule_name,
  coalesce(a.points, 0)      as answer_points,
  coalesce(p.points, 0)      as grant_points,
  coalesce(a.points, 0) + coalesce(p.points, 0) as total_points
from students s
join schedules sc on sc.id = s.schedule_id
left join groups g on g.id = s.group_id
left join lateral (
  select sum(points) as points from answers where student_id = s.id
) a on true
left join lateral (
  select sum(points) as points from point_events where student_id = s.id
) p on true
where s.is_active;

create or replace view v_group_totals
with (security_invoker = on) as
select
  g.id            as group_id,
  g.schedule_id,
  g.name          as group_name,
  count(vs.student_id)                              as member_count,
  coalesce(sum(vs.total_points), 0)                 as member_points,
  coalesce(gp.points, 0)                            as group_points,
  coalesce(sum(vs.total_points), 0) + coalesce(gp.points, 0) as total_points,
  case when count(vs.student_id) = 0 then 0
       else round((coalesce(sum(vs.total_points), 0)) / count(vs.student_id), 1)
  end as avg_points
from groups g
left join v_student_totals vs on vs.group_id = g.id
left join lateral (
  select sum(points) as points from point_events where group_id = g.id
) gp on true
group by g.id, g.schedule_id, g.name, gp.points;

create or replace view v_question_totals
with (security_invoker = on) as
select
  a.student_id,
  a.question_id,
  q.schedule_id,
  count(*) filter (where a.points > 0) as times_completed,
  sum(a.points)                        as points
from answers a
join questions q on q.id = a.question_id
group by a.student_id, a.question_id, q.schedule_id;
```

`security_invoker = on` is essential: without it a view runs as its owner and silently
bypasses every RLS policy written in Task 8.

- [ ] **Step 2: Write the env-gated view test**

Create `tests/db/views.test.js` asserting, against a seeded throwaway schedule:

1. `v_student_totals.total_points` equals the sum of that student's answer points plus their personal grants.
2. A group grant with `applied_to_members = false` moves `v_group_totals.total_points` but leaves every member's `v_student_totals.total_points` unchanged.
3. A group grant with `applied_to_members = true` (which the application records as child per-student events) raises both.
4. `v_question_totals.times_completed` counts only days scoring above zero, so a `single_choice` answer worth `-2` does not count as completed.
5. **The views respect RLS:** signed in as a student from schedule B, selecting `v_student_totals` returns only schedule B rows.

Point 5 is the one that catches a missing `security_invoker`.

- [ ] **Step 3: Apply the migration, run the test, then build the screens**

```bash
npm test -- tests/db/views.test.js
```

Expected: PASS, 5 tests.

`StudentBoard.js` fetches `v_student_totals` for the student's own schedule, ranked, with the current student's row highlighted and pinned to the bottom edge if it falls outside the visible window. Each row shows **rank · name · group · points**. It renders `<SkeletonList rows={10} />` while loading and a plain notice when `students_see_leaderboard` is false — the RLS policy already prevents the data from arriving, so the UI only has to explain the absence.

`app/(student)/settings/page.js` shows the student's name, group, schedule, a **تغيير الرمز** link to `/change-password`, a theme toggle, the pending-sync count, and **تسجيل الخروج** calling `signOut()`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_views.sql lib/boards app/\(student\)/board app/\(student\)/settings tests/db/views.test.js
git commit -m "feat(student): leaderboard views, student board, and settings"
```

---

## Phase 5 — Manager

### Task 19: Schedules and groups

**Files:**
- Create: `lib/validation/schedule.js`, `lib/schedules/api.js`
- Create: `app/(manage)/schedules/page.js`, `SchedulesList.js`, `ScheduleForm.js`, `ScheduleSettings.js`, `GroupsPanel.js`, `JoinLinksPanel.js`
- Create: `app/api/schedules/clone/route.js`
- Create: `components/manage/ScheduleSwitcher.js`
- Test: `tests/validation/schedule.test.js`, `tests/api/clone.test.js`

**Interfaces:**
- Produces: `scheduleSchema` — `{ name, start_date, end_date (nullable), streak_threshold_pct, backfill_days, students_see_leaderboard }`.
- Produces: `lib/schedules/api.js` — `listSchedules(client)`, `createSchedule(client, input)` (generates the slug, seeds the four default criteria via `seed_default_criteria`), `updateSchedule`, `archiveSchedule`, `reopenSchedule`, `rotateSlug(client, scheduleId)`, `listGroups`, `createGroup`, `renameGroup`, `deleteGroup`, `rotateGroupSlug`.
- Produces: `POST /api/schedules/clone` accepting `{ scheduleId, name, startDate, endDate }`.

- [ ] **Step 1: Write the failing validation test**

Create `tests/validation/schedule.test.js` asserting:

```js
it('accepts a null end date for an open-ended schedule', () => {
  expect(scheduleSchema.safeParse({
    name: 'رحلة مفتوحة', start_date: '2026-08-01', end_date: null,
    streak_threshold_pct: 100, backfill_days: 3, students_see_leaderboard: true,
  }).success).toBe(true);
});

it('rejects an end date before the start date', () => { /* expect success === false */ });
it('rejects a threshold outside 1..100', () => { /* 0 and 101 both fail */ });
it('rejects a backfill window outside 0..365', () => { /* -1 and 366 both fail */ });
it('rejects an empty or over-long name', () => { /* '' and 'x'.repeat(161) both fail */ });
it('strips unknown keys such as status and slug', () => {
  const parsed = scheduleSchema.parse({ name: 'ر', start_date: '2026-08-01', end_date: null, status: 'archived', slug: 'hack' });
  expect(parsed.status).toBeUndefined();
  expect(parsed.slug).toBeUndefined();
});
```

The last case matters: a manager must not be able to set `slug` or `status` by posting extra fields.

- [ ] **Step 2: Run it, implement `lib/validation/schedule.js`, run it again**

Use `.strict()` for rejection or `.strip()` for silent removal — here use `.strip()` so extra
fields are dropped rather than erroring, and assert the stripping in the test above.

- [ ] **Step 3: Write the failing clone test**

Create `tests/api/clone.test.js` asserting that `POST /api/schedules/clone`:

1. Returns `403` cross-site, `401` without a bearer token.
2. Returns `403` when the caller is not staff of the source schedule — **the key authorization test.**
3. Copies questions and criteria and groups, with fresh ids and a fresh slug.
4. Copies **no** students and **no** answers.
5. Writes an audit entry with `action: 'clone'` naming the source schedule.

- [ ] **Step 4: Implement the clone route**

It must verify staffing by querying through `createRequestClient(token)` — letting RLS answer
the authorization question — and only then switch to the service client for the bulk copy.

- [ ] **Step 5: Build the screens**

`SchedulesList.js` — cards showing name, date range (`مفتوحة` when `end_date` is null), student count, status, with `<SkeletonList rows={4} />` while loading and optimistic archive/reopen.

`ScheduleForm.js` — create/edit with an **بدون تاريخ نهاية** checkbox that nulls `end_date` and disables the date field.

`ScheduleSettings.js` — threshold slider, backfill days stepper, leaderboard visibility toggle, clone button, archive/reopen, delete (super admin only).

`GroupsPanel.js` — add/rename/reorder/delete groups, showing member counts; deleting a group with members asks for a destination group first.

`JoinLinksPanel.js` — the schedule link and one link per group, each with a copy button, a QR code rendered locally as inline SVG (no external service), and a **تجديد الرابط** button that warns the old link stops working.

`ScheduleSwitcher.js` — a dropdown in the manage layout listing the caller's schedules, persisting the selection in `localStorage` under `qawafel.schedule`.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/schedule.js lib/schedules app/\(manage\)/schedules app/api/schedules components/manage tests/validation/schedule.test.js tests/api/clone.test.js
git commit -m "feat(manage): schedule and group management with join links and cloning"
```

---

### Task 20: Student management

**Files:**
- Create: `app/api/students/create/route.js`, `app/api/students/reset-pin/route.js`, `app/api/students/deactivate/route.js`
- Create: `app/(manage)/students/page.js`, `StudentsTable.js`, `AddStudentDialog.js`, `TempPinSheet.js`
- Test: `tests/api/students-create.test.js`

**Interfaces:**
- Produces: `POST /api/students/create` accepting `{ scheduleId, groupId, students: [{ full_name, pin? }] }`, returning `{ created: [{ id, full_name, tempPin }] }`. Used by both the single-add dialog and the Excel import in Task 21.
- Produces: `POST /api/students/reset-pin` accepting `{ studentId }`, returning `{ tempPin }`.
- Produces: `POST /api/students/deactivate` accepting `{ studentId, active }`.

- [ ] **Step 1: Write the failing create test**

Create `tests/api/students-create.test.js` asserting:

1. `403` cross-site; `401` without a bearer token.
2. `403` when the caller does not staff the target schedule.
3. `400` when `students` is empty, exceeds 500 entries, or a name is blank or over 120 characters.
4. `400` when a supplied PIN fails `validateStudentPin`.
5. On success: one `auth.admin.createUser` call per student with `email: studentEmail(id)` and `email_confirm: true`; the student row carries `must_change_password: true`; the response returns the temp PIN **once**.
6. The audit entry records the student's name and id but **never** the PIN:

```js
expect(JSON.stringify(rpc.mock.calls.filter(([n]) => n === 'write_audit'))).not.toMatch(/\d{6}/);
```

7. A partial failure rolls back: if creating the third auth user fails, the two students already inserted are deleted and the response is `500` with nothing half-created.

- [ ] **Step 2: Implement the route**

Order of operations per student: insert the `students` row to obtain its id → create the auth
user with `studentEmail(id)` and the generated PIN → write `auth_uid` back to the row. If any
step throws, delete every row and auth user created in this request before returning.

Rate-limit at `students_create:{userId}` — 10 per hour.

- [ ] **Step 3: Build the screens**

`StudentsTable.js` — searchable, group-filterable table with **name · group · points · completion % · streak · status**, `<SkeletonList rows={12} />` while loading, optimistic group moves and activation toggles, and row actions **إعادة تعيين الرمز** / **تعطيل**.

`TempPinSheet.js` — a print-friendly view (`@media print` styles, one card per student showing name, group, schedule, join link, and the temp PIN) shown once after creation or reset, with an explicit warning that the PIN is not retrievable afterwards.

- [ ] **Step 4: Commit**

```bash
git add app/api/students app/\(manage\)/students tests/api/students-create.test.js
git commit -m "feat(manage): student creation, PIN reset, and printable credential sheets"
```

---

### Task 21: Excel import

**Files:**
- Create: `lib/excel/import.js`
- Create: `app/(manage)/students/import/page.js`, `ImportWizard.js`
- Test: `tests/excel/import.test.js`

**Interfaces:**
- Produces: `parseStudentWorkbook(arrayBuffer) -> Promise<{ rows: [{ rowNumber, full_name, pin }], errors: [{ rowNumber, message }] }>`
- Produces: `validateImportRows(rows) -> { valid, invalid }` applying name and PIN rules plus duplicate-name detection within the file.

The file carries **two columns only** — `الاسم` and an optional `الرمز`. The group is chosen in the wizard, never in the file.

- [ ] **Step 1: Write the failing import test**

Create `tests/excel/import.test.js`. Build fixtures in-memory with ExcelJS so no binary files enter the repo:

```js
import ExcelJS from 'exceljs';

async function workbook(rows, header = ['الاسم', 'الرمز']) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلاب');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
}
```

Assertions:

1. Parses a well-formed sheet into rows carrying `full_name` and `pin`.
2. Accepts a sheet with only the `الاسم` column, leaving `pin` undefined.
3. Accepts the English headers `name` and `pin` as aliases.
4. Reports a row with a blank name as an error naming its row number, and does not include it in `rows`.
5. Trims surrounding whitespace and collapses internal runs of spaces in names.
6. Rejects a PIN that is not six digits, naming the row.
7. Flags duplicate names within the file as errors rather than silently creating two students.
8. **Rejects a formula cell** rather than evaluating or importing it:

```js
it('rejects a cell containing a formula', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلاب');
  ws.addRow(['الاسم', 'الرمز']);
  ws.addRow([{ formula: 'HYPERLINK("http://evil.example")' }, '482913']);
  const { errors } = await parseStudentWorkbook(await wb.xlsx.writeBuffer());
  expect(errors[0].message).toMatch(/صيغة/);
});
```

9. Rejects a workbook with more than 5000 data rows.
10. Rejects a workbook with more than 10 columns.
11. Rejects a buffer that is not a valid workbook, with a readable Arabic message rather than an ExcelJS stack.

- [ ] **Step 2: Run it, implement `lib/excel/import.js`, run it again**

Guards to implement: reject when `worksheet.rowCount > 5001`; reject when `worksheet.columnCount > 10`; treat any cell whose value is an object carrying a `formula` key as an error; coerce every value with `String(...)` before use; cap name length at 120 characters.

- [ ] **Step 3: Build the wizard**

`ImportWizard.js`, four steps: **choose group → drop file → review → confirm**.

- The file input accepts `.xlsx,.csv`, rejects anything over 2 MB, and checks the leading bytes (`50 4B` for xlsx) before parsing.
- Parsing happens entirely in the browser; the file is never uploaded.
- The review table lists every row with a green tick or a red message, a count of valid and invalid rows, and refuses to proceed while zero rows are valid; invalid rows are skipped, not blocking.
- Confirm posts the valid rows to `/api/students/create` (Task 20) in batches of 50, showing a progress bar, then hands off to `TempPinSheet`.

- [ ] **Step 4: Commit**

```bash
git add lib/excel/import.js app/\(manage\)/students/import tests/excel/import.test.js
git commit -m "feat(manage): client-side Excel student import with validation preview"
```

---

### Task 22: Question builder

**Files:**
- Create: `components/questions/editors/` — one editor per type, plus `QuestionEditor.js`
- Create: `app/(manage)/questions/page.js`, `QuestionsList.js`, `LibraryPicker.js`, `QuestionPreview.js`
- Create: `lib/questions/api.js`
- Test: `tests/ui/question-editor.test.js`

**Interfaces:**
- Produces: `<QuestionEditor question onSave onCancel />` — a dialog holding title, help text, section, points, type selector, the type-specific config editor, day scheduling, and required flag.
- Produces: `lib/questions/api.js` — `listQuestions`, `createQuestion`, `updateQuestion`, `archiveQuestion`, `reorderQuestions(client, orderedIds)`, `copyFromLibrary(client, { scheduleId, libraryIds })`.

- [ ] **Step 1: Write the failing editor test**

Create `tests/ui/question-editor.test.js` asserting:

1. Changing the type swaps in the matching config editor and resets `config` to that type's defaults — a stale `options` array must not survive a switch to `counter`.
2. The choice editor adds, removes, and reorders options, and refuses to save with fewer than two.
3. The choice editor auto-generates an option `id` from the index (`opt_1`, `opt_2`) so a manager never types one, and keeps existing ids stable when reordering — **changing an id would orphan every stored answer**.
4. Save is blocked with a visible message when `parseConfig` fails, and the message is the Arabic text from Task 2.
5. The day-scheduling control emits `active_weekdays: [5]` when only Friday is selected and `null` when all seven are selected.
6. The live preview renders the real Task 15 renderer with the in-progress config.
7. Points and per-option points accept negative values for choice types, and the counter editor refuses a `max` of zero.

Test 3 in full, because it guards data integrity:

```js
it('keeps option ids stable when options are reordered', async () => {
  const onSave = vi.fn();
  render(<QuestionEditor question={{ type: 'single_choice', config: { options: [
    { id: 'opt_1', label: 'أ', points: 1 },
    { id: 'opt_2', label: 'ب', points: 2 },
  ] } }} onSave={onSave} onCancel={() => {}} />);

  await userEvent.click(screen.getByLabelText('تحريك الخيار "ب" لأعلى'));
  await userEvent.click(screen.getByRole('button', { name: 'حفظ' }));

  expect(onSave.mock.calls[0][0].config.options).toEqual([
    { id: 'opt_2', label: 'ب', points: 2 },
    { id: 'opt_1', label: 'أ', points: 1 },
  ]);
});
```

- [ ] **Step 2: Run it, implement the editors, run it again**

- [ ] **Step 3: Build the questions screen**

`QuestionsList.js` — sections as collapsible groups, each question a row showing title, type badge, points, and its schedule restriction as a chip (`الجمعة فقط`, `من 5 إلى 10 أغسطس`). Drag to reorder with an optimistic write of the new `sort_order`. Row actions: edit, duplicate, archive. Archiving a question that already has answers shows a confirmation explaining that history is preserved.

`LibraryPicker.js` — a modal listing `question_library` grouped by section with checkboxes and a **نسخ إلى الرحلة** button; already-copied items are marked. Copies are independent from that moment on, and the modal says so.

- [ ] **Step 4: Commit**

```bash
git add components/questions/editors app/\(manage\)/questions lib/questions/api.js tests/ui/question-editor.test.js
git commit -m "feat(manage): question builder with per-type editors, scheduling, and library picker"
```

---

### Task 23: Criteria and grading

**Files:**
- Create: `app/(manage)/grading/page.js`, `CriteriaPanel.js`, `StudentGrant.js`, `GroupGrant.js`, `GrantHistory.js`
- Create: `app/api/grants/route.js`
- Create: `lib/grants/api.js`
- Test: `tests/api/grants.test.js`

**Interfaces:**
- Produces: `POST /api/grants` accepting
  `{ scheduleId, criterionId, points, note, target: { kind: 'student', studentId } | { kind: 'group', groupId, applyToMembers } }`.
  For a group grant with `applyToMembers`, it writes the parent group event **and** one child event per member with `parent_event_id` set, inside a single transaction via an RPC.

- [ ] **Step 1: Write the failing grants test**

Create `tests/api/grants.test.js` asserting:

1. `403` cross-site; `401` unauthenticated; `403` when the caller does not staff the schedule.
2. `400` when `points` is zero, non-numeric, or beyond ±1000.
3. `400` when the criterion belongs to a different schedule — a cross-schedule criterion id must not be usable.
4. `400` when the criterion has `allow_negative: false` and `points < 0`, surfacing the Arabic message.
5. A group grant with `applyToMembers: false` writes exactly one row.
6. A group grant with `applyToMembers: true` writes one parent plus one child per active member, each child carrying `parent_event_id`.
7. Deactivated students receive no child event.
8. The audit entry records target kind, criterion name, points, and note.
9. Rate-limited at 60 grants per hour per user.

- [ ] **Step 2: Implement the route and the supporting RPC**

Add to a new migration `supabase/migrations/0007_grants.sql`:

```sql
create or replace function grant_group_points(
  p_schedule uuid, p_group uuid, p_criterion uuid,
  p_points numeric, p_note text, p_apply_to_members boolean
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare parent_id uuid;
begin
  if not is_staff_of(p_schedule) then
    raise exception 'غير مصرح';
  end if;

  insert into point_events (schedule_id, group_id, criterion_id, points, note, applied_to_members, created_by)
  values (p_schedule, p_group, p_criterion, p_points, coalesce(p_note, ''), p_apply_to_members, auth.uid())
  returning id into parent_id;

  if p_apply_to_members then
    insert into point_events (schedule_id, student_id, criterion_id, points, note, parent_event_id, created_by)
    select p_schedule, s.id, p_criterion, p_points, coalesce(p_note, ''), parent_id, auth.uid()
    from students s
    where s.group_id = p_group and s.is_active;
  end if;

  return parent_id;
end $$;
```

The `is_staff_of` check inside the function is required: `SECURITY DEFINER` bypasses RLS, so
without it any authenticated user could grant points to any group.

- [ ] **Step 3: Build the screens**

`CriteriaPanel.js` — list, add, rename, reorder, archive criteria; the **يسمح بالخصم** toggle is disabled once the criterion has events, since flipping it would contradict history.

`StudentGrant.js` — student picker (searchable, showing group), criterion picker, a points stepper with quick chips (±1, ±5, ±10), a note field, and separate **زيادة** / **خصم** buttons; the خصم button is hidden when the criterion forbids negatives.

`GroupGrant.js` — the same with a group picker plus the **إضافة النقاط لكل طالب في المجموعة أيضاً** checkbox, and a live preview line reading `سيحصل 5 طلاب على 10 نقاط لكل واحد`.

`GrantHistory.js` — a reverse-chronological list with optimistic insert and an **تراجع** action that deletes the event (cascading to children through `parent_event_id`) and is itself audited.

- [ ] **Step 4: Commit**

```bash
git add app/\(manage\)/grading app/api/grants lib/grants supabase/migrations/0007_grants.sql tests/api/grants.test.js
git commit -m "feat(manage): schedule criteria and student/group point grants"
```

---

### Task 24: Manager leaderboards

**Files:**
- Create: `app/(manage)/boards/page.js`, `OverallBoard.js`, `GroupsBoard.js`, `PerQuestionBoard.js`
- Create: `components/boards/BoardTable.js`, `components/boards/RankBadge.js`
- Test: `tests/boards/queries.test.js`

**Interfaces:**
- Consumes: the views from Task 18 and `lib/boards/queries.js`.
- Produces: `<BoardTable columns rows loading sortKey onSort />` — a sortable table with a skeleton state, reused by Task 29's global board.

- [ ] **Step 1: Write the failing query test**

Create `tests/boards/queries.test.js` with a mocked Supabase client, asserting that each query
function builds the expected filter chain: `fetchStudentTotals` filters by `schedule_id`, adds
`group_id` only when a group is supplied, and applies a date range to the underlying answers
when `from`/`to` are given. Assert the ordering is `total_points` descending with `full_name`
ascending as the tie-break, so ranks are stable between renders.

- [ ] **Step 2: Implement and build the three boards**

`OverallBoard.js` — rank, name, **group**, answer points, grant points, total, completion %, streak. Every row shows the group, per the requirement that a student is always identifiable by group.

`GroupsBoard.js` — cards per group with total, average per member, member count, and a bar comparing groups; expanding a card lists its members with their totals.

`PerQuestionBoard.js` — a question picker, then the ranking for that question by `times_completed` and points, with a **الكل** view showing a compact grid of every question and its top three.

All three render `<SkeletonList>` while loading and prefetch the next tab's data on hover.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/boards components/boards tests/boards
git commit -m "feat(manage): overall, group, and per-question leaderboards"
```

---

### Task 25: Excel export

**Files:**
- Create: `lib/excel/export.js`, `lib/excel/sanitize.js`
- Create: `app/(manage)/export/page.js`, `ExportPanel.js`
- Test: `tests/excel/sanitize.test.js`, `tests/excel/export.test.js`

**Interfaces:**
- Produces: `sanitizeCell(value) -> string|number` — prefixes `'` to any string starting with `=`, `+`, `-`, `@`, tab, or carriage return.
- Produces: `buildWorkbook({ schedule, students, groups, questions, answers, grants, auditEntries }) -> Promise<Blob>` with sheets **ملخص الطلاب · السجل اليومي · سجل النقاط · المجموعات · سجل العمليات**.

- [ ] **Step 1: Write the failing sanitize test**

```js
describe('sanitizeCell', () => {
  it('neutralises formula-leading characters', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      expect(sanitizeCell(`${prefix}cmd|' /c calc'!A1`)).toBe(`'${prefix}cmd|' /c calc'!A1`);
    }
  });

  it('neutralises leading tab and carriage return', () => {
    expect(sanitizeCell('\tSUM(1)')).toBe("'\tSUM(1)");
    expect(sanitizeCell('\rSUM(1)')).toBe("'\rSUM(1)");
  });

  it('leaves ordinary Arabic text untouched', () => {
    expect(sanitizeCell('محمد علي')).toBe('محمد علي');
  });

  it('leaves numbers as numbers so Excel can still total them', () => {
    expect(sanitizeCell(42)).toBe(42);
    expect(sanitizeCell(-7)).toBe(-7);
  });

  it('renders null and undefined as an empty string', () => {
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
  });
});
```

Note that a **negative number** must stay numeric while a **string starting with `-`** gets
quoted — that distinction is the test's whole point, since point deductions are negative.

- [ ] **Step 2: Write the failing export test**

Assert that `buildWorkbook` produces the five named sheets; that the daily-sheet matrix has one
row per student per day and one column per question; that a student named `=cmd` is written as
`'=cmd`; that RTL is set via `worksheet.views = [{ rightToLeft: true }]`; and that reading the
generated buffer back with ExcelJS round-trips the values.

- [ ] **Step 3: Implement and build the panel**

`ExportPanel.js` — checkboxes for which sheets to include, an optional date range, a group filter, and a **تصدير** button that fetches the data, builds the workbook in the browser, and triggers a download named `qawafel-<schedule>-<YYYY-MM-DD>.xlsx`. Exporting is audited with `action: 'export'` and the sheet list.

- [ ] **Step 4: Commit**

```bash
git add lib/excel app/\(manage\)/export tests/excel
git commit -m "feat(manage): five-sheet Excel export with formula-injection protection"
```

---

### Task 26: Schedule audit log view

**Files:**
- Create: `app/(manage)/log/page.js`, `components/audit/AuditTable.js`, `components/audit/AuditFilters.js`
- Create: `lib/audit/query.js`
- Test: `tests/audit/query.test.js`

**Interfaces:**
- Produces: `fetchAuditLog(client, { scheduleId, actorId, entityType, action, from, to, cursor, limit })` returning `{ rows, nextCursor }`, keyset-paginated on `(created_at, id)` so 200 students' worth of ticks stays fast.
- Produces: `describeEntry(entry) -> string` — a human Arabic sentence such as `غيّر «محمد» نقاط سؤال «صلاة الوتر» من 5 إلى 7`.

- [ ] **Step 1: Write the failing test**

Assert that `fetchAuditLog` always constrains by `schedule_id` when one is supplied; that it
orders `created_at` descending; that `nextCursor` is null on the last page; and that
`describeEntry` renders each `entity_type`/`action` pair, falling back to a generic sentence
for an unknown pair instead of throwing or printing `undefined`.

- [ ] **Step 2: Implement and build the screen**

`AuditFilters.js` — actor, entity type, action, and date-range pickers, reflected into the URL query string so a filtered view is shareable.

`AuditTable.js` — time (Riyadh), actor with role badge, the `describeEntry` sentence, and an expandable row showing the raw `before`/`after` JSON in a `<pre>` (as text, never as HTML). Infinite scroll on `nextCursor` with `<SkeletonList rows={10} />` for both the initial load and each page.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/log components/audit lib/audit/query.js tests/audit
git commit -m "feat(manage): filterable schedule audit log"
```

---

## Phase 6 — Super admin

### Task 27: Staff accounts and schedule assignment

**Files:**
- Create: `app/api/staff/create/route.js`, `app/api/staff/reset-password/route.js`, `app/api/staff/assign/route.js`
- Create: `app/(admin)/staff/page.js`, `StaffTable.js`, `StaffForm.js`, `AssignmentMatrix.js`
- Test: `tests/api/staff.test.js`

**Interfaces:**
- Produces: `POST /api/staff/create` accepting `{ username, displayName, role, password }` → `{ id, username }`.
- Produces: `POST /api/staff/assign` accepting `{ userId, scheduleIds: [] }` — replaces that manager's assignments wholesale.
- Produces: `POST /api/staff/reset-password` accepting `{ userId, newPassword }`.

- [ ] **Step 1: Write the failing staff test**

Assert:

1. Every route returns `403` unless the caller is a **super admin** — a manager must not create staff. Test this explicitly for each of the three routes.
2. `400` for a username failing `normalizeUsername`, and `409` for one already taken.
3. `400` for a password failing `validateStaffPassword`.
4. Creating a manager writes the `auth.users` row **and** the `app_users` row, and rolls both back if either fails.
5. `POST /api/staff/assign` with `scheduleIds: []` removes every assignment, and with three ids leaves exactly those three.
6. A super admin cannot deactivate or demote **themselves** — assert `400` with a clear message, so the system can never be left without an administrator.
7. No route echoes a password in its response or its audit entry.

Point 6 in full:

```js
it('refuses to let a super admin demote themselves', async () => {
  const res = await post('/api/staff/update', { userId: CALLER_ID, role: 'manager' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/لا يمكنك تغيير صلاحياتك/);
});
```

- [ ] **Step 2: Implement the routes**

Each begins with `is_super_admin()` verified through `createRequestClient(token)` — asking the
database rather than trusting any client-supplied role.

- [ ] **Step 3: Build the screens**

`StaffTable.js` — username, display name, role, assigned schedule count, active toggle, last login (from the audit log).

`AssignmentMatrix.js` — a managers × schedules grid of checkboxes with optimistic toggling, making it obvious at a glance that one manager can hold several schedules and one schedule several managers.

- [ ] **Step 4: Commit**

```bash
git add app/api/staff app/\(admin\)/staff tests/api/staff.test.js
git commit -m "feat(admin): staff accounts and many-to-many schedule assignment"
```

---

### Task 28: Master question library

**Files:**
- Create: `app/(admin)/library/page.js`, `LibraryTable.js`
- Modify: `lib/questions/api.js` — add `listLibrary`, `createLibraryQuestion`, `updateLibraryQuestion`, `deleteLibraryQuestion`
- Test: `tests/api/library.test.js`

**Interfaces:**
- Consumes: `QuestionEditor` from Task 22, reused unchanged — the library editor is the same component pointed at a different table.

- [ ] **Step 1: Write the failing test**

Assert that a manager can `select` from `question_library` but that `insert`, `update`, and
`delete` all fail for them and succeed for a super admin — verifying the Task 8 policies from
the application's side. Assert that editing a library question leaves copies already inside
schedules untouched:

```js
it('does not mutate schedule copies when the library entry changes', async () => {
  await updateLibraryQuestion(admin, libraryId, { points: 99 });
  const { data } = await admin.from('questions').select('points').eq('library_id', libraryId).single();
  expect(Number(data.points)).toBe(5);
});
```

- [ ] **Step 2: Implement and build the screen**

`LibraryTable.js` — sections, drag-reorder, add/edit/delete, and a **مستخدم في N رحلة** counter per entry so deleting a widely-used entry is a considered act. Deletion only clears `questions.library_id` (the foreign key is `on delete set null`); it never removes a schedule's copy.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/library lib/questions/api.js tests/api/library.test.js
git commit -m "feat(admin): master question library management"
```

---

### Task 29: Global leaderboard

**Files:**
- Create: `app/(admin)/global-board/page.js`, `GlobalBoard.js`, `GlobalFilters.js`, `CompareSchedules.js`
- Create: `lib/boards/global.js`
- Create: `supabase/migrations/0008_global_views.sql`
- Test: `tests/boards/global.test.js`

**Interfaces:**
- Produces: `fetchGlobalBoard(client, filters) -> { rows, totals }` where `filters` is
  `{ scheduleIds, groupIds, questionIds, questionTypes, criterionIds, from, to, groupBy, sortKey, sortDir, limit, cursor }`
  and `groupBy` is one of `'student' | 'group' | 'schedule' | 'name'`.
- Produces: `v_global_student_totals` — `v_student_totals` widened with `schedule_name`, `schedule_status`, `normalized_name`, and date-bounded point sums.

- [ ] **Step 1: Write the failing filter test**

With a mocked client, assert that every filter narrows the query and that combinations compose:
schedule + group + date range together produce all three constraints; an empty filter object
produces no constraints beyond the RLS-implied ones; `groupBy: 'name'` aggregates rows sharing
a `normalized_name` across schedules and sums their points, which is how one person appearing
in several schedules is rolled up. Assert `normalizeName` collapses whitespace and strips
Arabic diacritics and tatweel so `مُحَمَّد علي` and `محمد  علي` aggregate together:

```js
it('normalizes Arabic names for cross-schedule aggregation', () => {
  expect(normalizeName('مُحَمَّد  علي')).toBe(normalizeName('محمد علي'));
  expect(normalizeName('محمـــد علي')).toBe(normalizeName('محمد علي'));
});
```

- [ ] **Step 2: Implement the migration, the query layer, and the screen**

`GlobalFilters.js` — a collapsible filter bar with multi-selects for schedules, groups, questions, question types, and criteria, plus a date range and a group-by selector. Filters serialize into the URL.

`GlobalBoard.js` — `<BoardTable>` from Task 24 with sortable columns, always showing **name · group · schedule**, keyset pagination, and an **تصدير هذه النتيجة** button reusing Task 25's builder on the current filtered view.

`CompareSchedules.js` — pick two or more schedules and see totals, averages, completion %, and participation side by side.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/global-board lib/boards/global.js supabase/migrations/0008_global_views.sql tests/boards/global.test.js
git commit -m "feat(admin): fully filterable cross-schedule leaderboard"
```

---

### Task 30: Global audit log

**Files:**
- Create: `app/(admin)/global-log/page.js`
- Modify: `lib/audit/query.js` — allow a null `scheduleId` for super admins and add an actor filter
- Test: extend `tests/audit/query.test.js`

- [ ] **Step 1: Write the failing test**

Assert that `fetchAuditLog` with `scheduleId: null` applies no schedule constraint (super admin
path) while a manager's call always carries one, and that the actor and action filters compose
with the date range.

- [ ] **Step 2: Build the screen**

Reuses `AuditTable` and `AuditFilters` from Task 26, adding an actor filter listing all staff plus a **الطلاب** bucket, and a schedule filter. A summary strip shows counts by action for the selected range.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/global-log lib/audit/query.js tests/audit
git commit -m "feat(admin): global audit log with actor and schedule filters"
```

---

## Phase 7 — Polish and ship

### Task 31: Service worker, theming, and loading polish

**Files:**
- Create: `public/sw.js`, `public/manifest.webmanifest`, `components/pwa/RegisterSW.js`, `components/ui/ThemeToggle.js`
- Modify: `app/layout.js`, every list screen
- Test: `tests/pwa/sw-strategies.test.js`

**Interfaces:**
- Produces: `chooseStrategy(request) -> 'network-only' | 'cache-first' | 'stale-while-revalidate'` exported from `public/sw.js` via a small shared module `lib/pwa/strategy.js` so it is unit-testable outside the worker.

- [ ] **Step 1: Write the failing strategy test**

```js
describe('chooseStrategy', () => {
  it('never caches API calls', () => {
    expect(chooseStrategy(new Request('https://qawafel.app/api/auth/login'))).toBe('network-only');
    expect(chooseStrategy(new Request('https://qawafel.app/api/join/abcdefghij'))).toBe('network-only');
  });

  it('never caches Supabase traffic', () => {
    expect(chooseStrategy(new Request('https://xyz.supabase.co/rest/v1/answers'))).toBe('network-only');
  });

  it('caches immutable build assets first', () => {
    expect(chooseStrategy(new Request('https://qawafel.app/_next/static/chunks/main.js'))).toBe('cache-first');
  });

  it('revalidates navigations in the background', () => {
    const req = new Request('https://qawafel.app/today', { headers: { accept: 'text/html' } });
    expect(chooseStrategy(req)).toBe('stale-while-revalidate');
  });

  it('leaves non-GET requests uncached', () => {
    expect(chooseStrategy(new Request('https://qawafel.app/today', { method: 'POST' }))).toBe('network-only');
  });
});
```

Caching an auth response would be a security bug, which is why the first two cases exist.

- [ ] **Step 2: Implement the strategy module and the worker**

`public/sw.js` precaches the app shell on `install`, deletes stale caches on `activate`, applies `chooseStrategy` on `fetch`, and responds to a `SKIP_WAITING` message. Cache names carry a version constant bumped on each deploy.

`RegisterSW.js` registers the worker after `load`, and shows a **تحديث متاح** toast when a new worker is waiting.

- [ ] **Step 3: Finish the visual layer**

- `ThemeToggle.js` writes `data-theme` to `<html>` and persists to `localStorage`; the root layout reads it before paint with a tiny inline script carrying the CSP nonce.
- Add the eight-fold geometric background texture as an inline SVG data URI at low opacity on the auth and board screens only — the logo mark itself is never used.
- Audit every screen for a skeleton state and every mutation for an optimistic path; add `router.prefetch` on nav hover and an `IntersectionObserver` prefetch for board and log rows.
- Verify contrast for navy-on-white and gold-on-navy in both themes at AA.

- [ ] **Step 4: Commit**

```bash
git add public lib/pwa components/pwa components/ui/ThemeToggle.js app/layout.js tests/pwa
git commit -m "feat: service worker, theme toggle, and loading-state polish"
```

---

### Task 32: Security verification and deployment

**Files:**
- Create: `docs/SETUP.md`, `docs/SECURITY.md`
- Create: `tests/security/no-service-key-in-client.test.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing leak test**

Create `tests/security/no-service-key-in-client.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(process.cwd());

describe('client bundle safety', () => {
  it('never references the service role key outside lib/supabase/server.js', () => {
    const offenders = files.filter(
      (f) => readFileSync(f, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY')
        && !f.endsWith(path.join('lib', 'supabase', 'server.js'))
        && !f.includes(path.join('tests', ''))
        && !f.includes(path.join('docs', '')),
    );
    expect(offenders).toEqual([]);
  });

  it('never imports the server Supabase module from a client component', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return src.includes("'use client'") && src.includes('@/lib/supabase/server');
    });
    expect(offenders).toEqual([]);
  });

  it('never uses dangerouslySetInnerHTML', () => {
    const offenders = files.filter(
      (f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML') && !f.includes('tests'),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps no hard-coded Supabase keys in source', () => {
    const jwtLike = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
    const offenders = files.filter((f) => jwtLike.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the full suite and the audit**

```bash
npm test && npm run lint && npm audit --omit=dev && npm run build
```

Expected: all tests pass, lint clean, `npm audit` reports 0 vulnerabilities, build succeeds.
Any advisory must be resolved or explicitly justified in `docs/SECURITY.md` — not ignored.

- [ ] **Step 3: Verify RLS from the outside**

With the app deployed to a Vercel preview, run the Phase 2 database suite against the live
project and additionally confirm by hand, using the browser console on the student view:

```js
const c = window.__qawafelClient; // exposed only in development builds
await c.from('students').select('*');           // expect: only the caller's schedule
await c.from('audit_log').select('*');           // expect: []
await c.from('app_users').select('*');           // expect: only the caller's own row, or []
await c.from('answers').update({ points: 9999 }).eq('id', someId);  // expect: no rows changed
```

Record the outputs in `docs/SECURITY.md`.

- [ ] **Step 4: Write the setup guide**

`docs/SETUP.md` covers, in order:

1. Create the Supabase project; note the region and copy the project URL, anon key, and service role key.
2. Run migrations `0001`–`0008` in the SQL editor.
3. Create the `mohammed` super admin per `supabase/README.md`.
4. Set Auth settings: disable public sign-ups, set the minimum password length to 6 (students use 6-digit PINs), set the site URL to the production domain.
5. Import the repo into Vercel; add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `AUTH_EMAIL_DOMAIN` as environment variables, with the service key marked server-only.
6. Deploy, then sign in as `mohammed`, create a manager, assign a schedule, and walk the first-run checklist: create groups → import students → copy questions from the library → print PIN sheets → share the join link.
7. Set the daily archive job: Supabase **Database → Cron** running
   `update schedules set status = 'archived', archived_at = now() where status = 'active' and end_date is not null and end_date < (now() at time zone timezone)::date;`
   at 00:05 Riyadh. Open-ended schedules (`end_date is null`) are deliberately untouched.

`docs/SECURITY.md` records the threat model, the control for each threat, and the verification output from Step 3.

- [ ] **Step 5: Final commit**

```bash
git add docs README.md tests/security
git commit -m "docs: setup and security guides, plus client bundle leak tests"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: roles → 10, 14, 27 · auth mechanism and login flow → 11 · passwords and PINs → 5, 13 · join links → 12, 19 · schedules incl. open-ended → 4, 6, 19 · groups → 19 · question types → 2, 15, 22 · library vs schedule → 22, 28 · day scheduling → 4, 22 · answers and DB-computed points → 3, 7 · derived metrics → 3, 5, 18 · criteria and grants → 23 · leaderboards → 18, 24, 29 · Excel import/export → 21, 25 · audit log → 9, 26, 30 · offline → 16, 17, 31 · security → 1, 7, 8, 9, 11, 21, 25, 32 · UI and design → 1, 15, 31 · module boundaries → the File Structure section · deployment → 32.

**Known deviations from the spec, deliberate:**
- The spec listed `0001`–`0005` migrations; the plan adds `0006_views.sql`, `0007_grants.sql`, and `0008_global_views.sql` because views and the group-grant RPC belong with the features that introduce them.
- The spec's file structure showed `lib/points/` as a client mirror only; the plan keeps that role but names the streak calculator there too, since it is pure display logic.

**Naming consistency checked across tasks:** `app_role()`, `app_student_id()`, `is_staff_of()`, `is_super_admin()`, `app_score_answer()`, `app_max_points()`, `write_audit()`, `rl_hit()`, `auth_check_lock()`, `auth_record_failure()`, `auth_reset_failures()`, `seed_default_criteria()`, `grant_group_points()` — each defined once and referenced with the same signature everywhere. On the JavaScript side: `scoreAnswer`, `maxPoints`, `completionPct`, `currentStreak`, `isQuestionActiveOn`, `activeQuestionsOn`, `todayInRiyadh`, `backfillWindow`, `isWithinBackfill`, `scheduleDayRange`, `enqueue`, `pending`, `flush`, `mirror`, `startAutoSync`, `sanitizeCell`, `buildWorkbook`, `writeAudit`, `homeFor`, `canAccess`.

