# Setup and deployment — كلّما عرفته

A one-time setup, ~20 minutes. The app is a single-program, self-registration tracker:
users create their own accounts (email + password + a verification email), do daily tasks and
persistent read/listen assignments for points, and appear on a leaderboard **by emoji only**.
Admins manage tasks/assignments, see the users list (names, no points), can reveal a name on
the leaderboard behind a confirmation, create other admins, and can switch to the normal user
view of their own account.

---

## 1. Create the Supabase project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it `kollama`, set a strong DB password, pick the closest region
   (**Middle East (Bahrain)** or **Europe (Frankfurt)** for Saudi Arabia).
3. **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**server only — never expose it**)

## 2. Run the migrations

In **SQL Editor**, run every file in `supabase/migrations/` **in filename order**, from
`0001_schema.sql` through `0025_admin_mgmt.sql`. Each is safe to run once, top to bottom.

The redesign migrations (`0021`–`0025`) add: the single program, emoji/email profile columns,
the `handle_new_user` trigger (auto-creates a profile on sign-up), the task tables, the
de-identified leaderboard functions, their RLS, and `provision_admin`.

## 3. Turn on email verification + redirect URLs

**Authentication → Providers → Email:** enable **Confirm email** so a new user must click the
link before they can sign in.

**Authentication → URL Configuration:**
- **Site URL** → your deployed URL (e.g. `https://kollama.vercel.app`); use
  `http://localhost:3000` while developing.
- **Redirect URLs** → add both `https://YOUR-DOMAIN/login` and `http://localhost:3000/login`
  (registration sends the confirmation link back to `/login`).

For real email delivery beyond low-volume testing, configure **custom SMTP** under
**Authentication → Emails** — Supabase's built-in sender is rate-limited.

## 4. Create the first admin

Self-registration only makes normal users. Seed the first admin by hand:

1. **Authentication → Users → Add user** — enter your email + a password, and tick
   **Auto Confirm User**.
2. In **SQL Editor**, run (replace the email):

   ```sql
   insert into app_users (id, username, display_name, role)
   select id, 'admin', 'المشرف العام', 'super_admin'
   from auth.users where email = 'you@example.com'
   on conflict (id) do update set role = 'super_admin', is_active = true;

   insert into students (auth_uid, schedule_id, full_name, emoji, email,
                         must_change_password, is_active)
   select id, app_program(), 'المشرف العام', '🛡️', email, false, true
   from auth.users where email = 'you@example.com'
   on conflict (auth_uid) do nothing;
   ```

After this you can sign in as the admin and create any further admins from
**المشرفون** in the UI — no SQL needed.

## 5. Run it locally (optional)

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

Then:

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000/login>. Sign in as the admin, or open `/register` to make a user.

> `AUTH_EMAIL_DOMAIN` from the old build is **no longer used** — everyone now signs in with a
> real email. `WEBAUTHN_RP_ID` is only needed if you add a custom domain (see §8).

## 6. Push to GitHub & deploy to Vercel

1. Push this repository to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Next.js is detected; leave the
   build settings alone.
3. **Environment Variables** (Production, Preview, Development) — exactly these names:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service-role key |

   Do **not** set `SUPABASE_TEST_*` in Vercel — those are only for the local DB test suite.
4. Deploy, then set the Supabase **Site URL** (§3) to the Vercel domain.

## 7. First run

1. Sign in as the admin → you land on **المهام اليومية** (admin view).
2. **المهام اليومية** → add the daily tasks (title, optional description, points). They reset
   every day for every user.
3. **المهام المستمرة** → add **قراءة** and **استماع** items (title, the text/instructions,
   points). These stay on each user's list across days until they mark them done once. (The
   actual audio for a listen item is shared in your WhatsApp community; the app item is just
   the instruction + a "mark done" button.)
4. Share the site URL. Users open **/register**, enter name + email + password, pick an emoji,
   confirm the email, then sign in and start earning points.
5. **لوحة الصدارة** shows everyone by emoji + points. Tap a row → confirm → the name is
   revealed (admin only). **المستخدمون** lists all users with names/emails/emoji and their
   completion counts — no points — and a **CSV download**.
6. **⇄ وضع المستخدم** (top of the admin nav) switches you into the normal user app for your own
   account; **⇄ وضع المشرف** switches back.

## 8. Install as a phone app (PWA)

- **Android / Chrome:** site → menu (⋮) → **Add to Home screen**.
- **iPhone / Safari:** site → Share → **Add to Home Screen** (Safari only).

## 9. Biometric login

Any user or admin can add a fingerprint/Face ID to sign in without typing the password (the
password still works):

1. Sign in, go to **الإعدادات → الدخول بالبصمة → تفعيل البصمة على هذا الجهاز**.
2. Confirm with the device prompt and name the device.

Requirements: HTTPS (Vercel provides it) and a device with a biometric sensor. On a **custom
domain**, set `WEBAUTHN_RP_ID` to the bare hostname (e.g. `kollama.example.com`) and redeploy.

---

## Troubleshooting

**Start at `/api/health`** — it reports which credentials the build can see (names/booleans
only), whether the DB answers, and the deployed commit.

**"يرجى تأكيد بريدك الإلكتروني أولاً" on login.** The user hasn't clicked the verification
link. The login screen offers **إعادة إرسال رسالة التأكيد**. Check spam, and confirm SMTP /
the built-in sender isn't rate-limited.

**A new sign-up can log in but has no profile.** The `handle_new_user` trigger creates the
profile from the sign-up metadata; confirm migration `0021` ran and the trigger
`on_auth_user_created` exists on `auth.users`.

**"تم إيقاف الحساب مؤقتاً".** Five failed attempts → a 15-minute lockout that doubles. Clear it:

```sql
select auth_reset_failures('email:you@example.com');
```

**Users see an empty day.** No active daily tasks/assignments yet — add them under the admin
**المهام اليومية** / **المهام المستمرة** screens.
