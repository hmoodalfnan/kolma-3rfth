# Security model

Every control below is enforced **server-side or in the database**. The UI is a
convenience layer; nothing depends on it for safety.

## Authorization

| Threat | Control |
|---|---|
| A student reading another student's answers | RLS policy `answers_student_read` restricts rows to `student_id = app_student_id()` |
| A student writing someone else's answers | RLS `WITH CHECK` on insert and update, same predicate |
| A manager touching a schedule they do not run | `is_staff_of(schedule_id)` in every policy, backed by the `schedule_staff` join table |
| A manager promoting themselves | `app_users` write policy requires `is_super_admin()` |
| A super admin locking everyone out | `/api/staff` refuses to let a super admin demote or deactivate their own account |
| Privilege claims from the client | No endpoint accepts a role or schedule id as an authorization input; the caller's own token is used to ask the database |

RLS is `ENABLE`d **and** `FORCE`d on all ten application tables, default-deny.
Helper functions (`app_role`, `app_student_id`, `is_staff_of`, `is_super_admin`) are
`SECURITY DEFINER` with `search_path` pinned to `pg_catalog, public`, so they cannot be
hijacked by a schema shadowing attack. Views are created `WITH (security_invoker = on)` —
without that flag a view runs as its owner and silently bypasses every policy.

`tests/db/rls.test.js` asserts each row of that table against a live database.

## Point integrity

`answers.points` is recomputed by the `answers_score_guard` trigger on every insert and
update, from the question's own config. Whatever the client sends in `points` is discarded.
A student who edits the JavaScript in devtools cannot award themselves anything.

The same trigger family enforces the backfill window and the archive state, so a student
cannot backdate entries by crafting a request. Staff corrections are allowed at any date
and are recorded in the audit log as staff edits.

`tests/db/scoring.test.js` runs all eight scoring cases through both the JavaScript and
the SQL engine and fails if they ever disagree.

## Passkeys / biometric sign-in

Staff may enrol a passkey as a faster alternative to their password. The password
always remains valid — a passkey is an addition, never a replacement, so losing a
device never locks anyone out. Students are deliberately excluded: they share
devices and pick their name from a list, so a device-bound credential would end up
attached to the wrong person.

Verification uses `@simplewebauthn/server`; none of the CBOR parsing or signature
checking is hand-written.

| Threat | Control |
|---|---|
| Phishing a credential onto another domain | The RP ID comes from `WEBAUTHN_RP_ID` / `VERCEL_PROJECT_PRODUCTION_URL`, **never** the request's `Host` header, which a caller controls |
| Replaying a captured assertion | `webauthn_take_challenge` deletes the challenge as it reads it, so every challenge is single-use and expires after 5 minutes |
| A cloned authenticator | The signature counter must strictly advance; a regression is rejected and audit-logged as `passkey_counter_regression` |
| Mere presence instead of a real biometric | `userVerification: 'required'` at both enrolment and login |
| Forging an enrolment | `INSERT`/`UPDATE` on `webauthn_credentials` is revoked from `authenticated`; rows are only written by the route handler after the attestation verifies |
| Account enumeration | Login uses discoverable credentials, so no username is submitted and the options response reveals nothing about who exists |
| A revoked account signing in | The handler re-checks `app_users.is_active` after verification |

The private key never leaves the device's secure element; the database stores only
a public key. After a successful assertion the handler mints a real Supabase
session by generating and immediately redeeming a single-use magiclink token
server-side — the token is never returned to the browser.

## Brute force and rate limiting

All limits live in Postgres (`rate_limits`, `auth_lockouts`) and are applied before any
credential check.

| Endpoint | Limit |
|---|---|
| Login, per IP | 20 attempts / 10 min |
| Login, per identifier | 10 attempts / 10 min |
| Login lockout | 5 failures → 15 min, doubling per round, capped at 24 h |
| Change password | 5 / hour per user |
| Student create | 40 / hour per user |
| PIN reset | 100 / hour per user |
| Grants | 200 / hour per user |
| Export | 30 / hour per user |
| Join-link lookup | 60 / 5 min per IP |
| Passkey enrolment | 20 / hour per user |
| Passkey login | 30 / 10 min per IP |

A 6-digit PIN has a million combinations; at 10 attempts per 10 minutes with escalating
lockout, exhaustive search is not practical.

**Enumeration:** every failed login returns the identical message
`بيانات الدخول غير صحيحة` whether the account is unknown, the password is wrong, or the
student belongs to a different schedule. The student-name list behind a join link is
intentional — students pick their name — but it exposes names only, scoped to one
schedule, behind an unguessable 16-character slug the manager can rotate at any time.

## Injection

**SQL.** All access goes through supabase-js (parameterized PostgREST) or `rpc()` calls
with typed arguments. There is no string-concatenated SQL anywhere in the codebase. The
global board's sort key is validated against an allow-list before reaching `order()`.

**XSS.** React escapes by default. `dangerouslySetInnerHTML` appears **nowhere** in the
codebase — enforced by ESLint `react/no-danger: error` and re-checked by
`tests/security/bundle-safety.test.js`. The CSP sets `script-src 'self' 'nonce-…'
'strict-dynamic'` with no `unsafe-inline` and no `unsafe-eval`.

**Formula injection.** Every exported cell that begins with `=`, `+`, `-`, `@`, tab, or
carriage return is prefixed with `'`. Numbers stay numeric so Excel can still total them —
that distinction is explicitly tested, because point deductions are negative numbers.

**File.** There is no upload endpoint. Excel import is parsed entirely in the browser and
the file never leaves the device. Guards: 2 MB cap, extension plus magic-byte check,
5,000-row and 10-column caps, formula cells rejected outright, all values coerced to
strings and length-capped.

## Transport and headers

Emitted from `proxy.js` on every response:

- `Content-Security-Policy` — `default-src 'self'`, per-request nonce, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `connect-src` limited to self and the Supabase project origin
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera, microphone, geolocation, USB, payment

## CSRF

No auth cookies exist. The session lives in `localStorage` (required so the app boots
offline) and route handlers authenticate via an `Authorization: Bearer` header, which
browsers do not attach cross-site — so classic CSRF does not apply. As defence in depth,
every state-changing route handler additionally rejects requests whose `Origin` /
`Sec-Fetch-Site` is not same-origin. `tests/security/bundle-safety.test.js` fails the
build if any mutating handler is missing that guard.

## Secrets

The `service_role` key exists only in server-side environment variables and is imported
only by `lib/supabase/server.js`, which is marked `server-only` so a stray client import
fails at build time. A test scans every source file and fails if the key name appears
anywhere else, if a `'use client'` file imports the server module, or if a JWT-shaped
literal is committed.

## Input validation

Every route handler validates its body with a strict Zod schema before touching the
database — unknown keys are rejected, so a manager cannot set `slug` or `status` by
posting extra fields. The database re-validates independently through `CHECK` constraints,
enums, foreign keys, and the config/scoring validation functions.

## Audit log

Append-only. `UPDATE` and `DELETE` are revoked from `authenticated`, `anon`, and
`service_role`, and no policy grants them, so the log cannot be rewritten through the API
by anyone — including a super admin using the app. Managers read only their own schedules'
entries; the super admin reads everything.

Recorded: logins and failures, password changes, student create/import/PIN reset,
schedule create/update/clone/archive, question create/edit/archive, point grants and
undos, staff account changes and assignments, and exports.

## Verification

```bash
npm test
```

183+ unit tests run with no network. The database suite
(`tests/db/`, 39 tests) runs once Supabase credentials are set — see
[`supabase/README.md`](../supabase/README.md). Run it before going live; a failure there
is a real hole, not a flaky test.

```bash
npm audit
```

`exceljs` is used rather than the npm `xlsx` package, whose published version carries
unpatched prototype-pollution and ReDoS advisories.

`package.json` pins four transitive dependencies through `overrides` — `esbuild`, `vite`,
`postcss`, `sharp`, and `uuid` — because the versions Next.js and Vitest ship by default
carry advisories and npm's own suggested fix was to downgrade Next to v9 and ExcelJS to
v3. The overrides keep the current majors and clear the findings.

**One residual `npm audit` report is a false positive.** The advisory for
`brace-expansion` (GHSA-mh99-v99m-4gvg) is displayed by npm as the aggregate range
`<=5.0.7`, but it is actually patched per major line: `>=1.1.12`, `>=2.0.2`, `>=3.0.1`,
`>=4.0.1`. The two copies in this tree — reached through ExcelJS → archiver — resolve to
**1.1.16** and **2.1.3**, both above their thresholds. Verify at any time with:

```bash
npm ls brace-expansion --omit=dev --all
```

Forcing a v5 override there is counterproductive: v5 changed its export shape and breaks
the older `minimatch` that ESLint depends on.

## Known limits

- A 6-digit PIN is weak by nature. It is mitigated by rate limiting and lockout, not by
  entropy. Do not reuse these PINs for anything else.
- Anyone holding a join link can see the list of student names in that schedule. Rotate
  the link if it leaks.
- Managers can read all student answers within their own schedules. That is by design.
