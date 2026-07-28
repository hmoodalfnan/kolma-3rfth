# Setup and deployment

Everything below is a one-time setup. It takes about 20 minutes.

---

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it `qawafel`, choose a strong database password, and pick the region closest to
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
AUTH_EMAIL_DOMAIN=qawafel.internal
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
3. Under **Environment Variables**, add all four variables from step 3 for
   **Production, Preview, and Development**.
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

## 6. Verifying it works

- Open the join link on a phone, log in as a test student, tick a few items.
- Turn on airplane mode, tick more items, close and reopen the app — the ticks are still
  there and the amber offline banner shows the queue.
- Turn the network back on and watch the queue drain.
- Back in the manager view, the points appear on the leaderboard.

---

## Troubleshooting

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
