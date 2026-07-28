# قوافل — Faith & Conduct Tracker

A mobile-first Arabic web app for tracking students' daily faith practices and conduct
across multi-day programmes, with points, streaks, group competition, leaderboards, full
offline support, and a complete audit trail.

**Stack:** Next.js 16 (App Router, JavaScript) · Tailwind CSS v4 · Supabase Postgres with
RLS · Vercel · ExcelJS · Dexie.

## Quick start

```bash
npm install
```

Create `.env.local` from `.env.example`, then:

```bash
npm run dev
```

Full setup — creating the Supabase project, running the migrations, the super admin, and
deploying — is in **[docs/SETUP.md](docs/SETUP.md)**.

## What it does

**Students** open a per-schedule join link, pick their name, and enter a 6-digit PIN. They
see the day's items, tick them off, and watch their completion ring, streak, and rank.
The whole flow works offline after the first login — ticks queue in IndexedDB and sync
when the network returns.

**Managers** run one or more schedules: groups and per-group join links, students by hand
or bulk-imported from Excel, a fully customisable question builder, point grants against
schedule-defined criteria, three leaderboards, five-sheet Excel export, and a filterable
audit log.

**The super admin** additionally manages staff accounts and their schedule assignments,
the master question library, a cross-schedule leaderboard with every filter, and the
system-wide audit log.

## Question types

| Type | Example | Scoring |
|---|---|---|
| `bool` | صلاة الوتر | flat points |
| `per_prayer` | تكبيرة الإحرام → 5 rows | points per prayer |
| `single_choice` | الذهاب للمسجد → مشياً / بسيارة / لم أذهب | per option, may be negative |
| `multi_choice` | الأذكار | per option, summed |
| `counter` | كم صفحة قرأت؟ | × points per unit, capped |
| `rating` | تقييم الخشوع ★1–10 | × points per star |
| `text` | ملاحظات | always 0 |

Each question also carries its own weekday restriction and optional date sub-range, so
«صلاة الجمعة» can appear only on Fridays.

## Testing

```bash
npm test
```

183 unit tests run with no network. A further 39 database tests verify RLS, JavaScript↔SQL
scoring parity, rate limiting, and the audit log; they skip until Supabase credentials are
present — see [supabase/README.md](supabase/README.md).

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — Supabase, Vercel, and first-run walkthrough
- [docs/SECURITY.md](docs/SECURITY.md) — threat model and every control
- [supabase/README.md](supabase/README.md) — migrations, super admin, archive job
- [docs/superpowers/specs/](docs/superpowers/specs/) — design spec
- [docs/superpowers/plans/](docs/superpowers/plans/) — implementation plan
