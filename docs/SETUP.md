# Setup and deployment

Everything below is a one-time setup. It takes about 20 minutes.

---

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it `tracker`, choose a strong database password, and pick the region closest to
   your users (**Middle East (Bahrain)** or **Europe (Frankfurt)** for Saudi Arabia).
3. Wait for provisioning, then open **Project Settings → API** and copy three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**server only — never share it**)

## 2. Run the migrations

Follow [`supabase/README.md`](../supabase/README.md): run the eight SQL files in order,
create the `mohammed` super admin, and apply the auth settings and the daily archive job.

## 3. Run it locally (optional but recommended)

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
AUTH_EMAIL_DOMAIN=tracker.internal
```

Then:

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000/login> and sign in as `mohammed`.

## 4. Deploy to Vercel

1. Push this repository to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repository. Vercel detects
   Next.js automatically; leave the build settings alone.
3. Under **Environment Variables**, add these — exactly these names, for
   **Production, Preview, and Development**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service-role / secret key |
   | `AUTH_EMAIL_DOMAIN` | `tracker.internal` |

   **Do not set `SUPABASE_TEST_*` in Vercel.** Those are read only by the local
   database test suite; the app ignores them, and setting them instead of the
   three above leaves every page failing with a server error.
4. Deploy.
5. Go back to Supabase → **Authentication → URL Configuration** and set the Site URL to
   your new Vercel domain.

## 5. First run — the order that works

1. Sign in at `/login` as `mohammed`.
2. **المشرفون** → create a manager account for each supervisor, then tick which schedules
   each one runs. A manager can hold several schedules and a schedule can have several
   managers.
3. **الرحلات** → create a schedule. Leave **بدون تاريخ نهاية** ticked for an ongoing one.
   Set the streak threshold, how many days back students may edit, and whether students
   see the leaderboard.
4. Add the groups (rooms). Each group gets its own join link if you want room-specific links.
5. **البنود** → **نسخ من المكتبة** to pull in the standard items, then edit them or add
   your own. Every question type supports custom points, and choice options can carry
   negative points.
6. **الطلاب** → **استيراد Excel** with a two-column file (`الاسم`, optionally `الرمز`),
   choosing the group in the wizard. **Print the PIN sheet immediately** — those temp PINs
   are never shown again.
7. Share the join link (**الرحلات → رابط الرحلة**). Students pick their name, enter the
   temp PIN, and are forced to choose their own 6-digit PIN.

## 6. Installing it as a phone app

The site is a PWA, so it installs from the browser with no app store.

- **Android / Chrome:** open the site → menu (⋮) → **Add to Home screen** / **Install app**.
- **iPhone / Safari:** open the site → Share → **Add to Home Screen**. iOS only offers
  this in Safari, not Chrome.

Once installed it opens full-screen with no browser chrome, keeps working offline, and
carries the app icon. Long-pressing the icon on Android gives shortcuts straight to
**سجل اليوم** and **لوحة الصدارة**.

## 7. Turning on biometric login for staff

Managers and admins can sign in with a fingerprint or face instead of typing their
password. The password keeps working — this is an addition, not a replacement.

1. Sign in with username and password as usual.
2. Go to **حسابي → الدخول بالبصمة → تفعيل البصمة على هذا الجهاز**.
3. Confirm with the device's fingerprint/face prompt and give the device a name.

From then on the login screen shows **الدخول بالبصمة**. Each device is enrolled
separately, and any device can be revoked from the same screen.

Requirements: HTTPS (Vercel gives you this), and a device with a fingerprint sensor,
Face ID, or Windows Hello. If the button does not appear, the device does not support it.

On Vercel the passkey domain is detected automatically. **If you add a custom domain,**
set `WEBAUTHN_RP_ID` to that bare hostname (e.g. `tracker.example.com`, no `https://`)
and redeploy — passkeys are bound to one domain and will not work on another.

## 8. Verifying it works

- Open the join link on a phone, log in as a test student, tick a few items.
- Turn on airplane mode, tick more items, close and reopen the app — the ticks are still
  there and the amber offline banner shows the queue.
- Turn the network back on and watch the queue drain.
- Back in the manager view, the points appear on the leaderboard.

---

## Troubleshooting

**Start here: open `/api/health` on your deployment.** It reports which
credentials the running build can actually see (names and booleans only — never a
key), whether the database answers, and which commit is deployed. Almost every
"it does not work" turns out to be visible there in one glance.

**"بيانات الدخول غير صحيحة" for a user you just created.**
Check that the auth user exists in **Authentication → Users** and that the matching row
exists in `app_users` (staff) or `students` (students). Both are required.

**"تم إيقاف الحساب مؤقتاً".**
Five failed attempts triggers a 15-minute lockout that doubles on repeat. To clear it:

```sql
select auth_reset_failures('staff:mohammed');
```

**Students see an empty day.**
Their questions either have not been added to that schedule yet, or every question is
restricted to weekdays that do not include today.

**A student cannot edit an old day.**
That is the backfill window doing its job. Raise **أيام التعديل بأثر رجعي** in the
schedule settings, or make the correction yourself — staff edits are unrestricted and are
recorded in the audit log.
