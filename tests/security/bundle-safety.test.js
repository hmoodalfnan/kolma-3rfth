import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'docs', 'coverage']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const isTest = (f) => rel(f).startsWith('tests/');

describe('client bundle safety', () => {
  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // Only these two may name a secret credential, and both are server-only.
  const SECRET_ALLOWED = ['lib/supabase/env.server.js'];

  it('never references a secret Supabase key outside the server-only config', () => {
    const secretNames = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_KEY/;

    const offenders = files
      .filter((f) => secretNames.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !SECRET_ALLOWED.includes(f) && !f.startsWith('tests/'));

    expect(offenders).toEqual([]);
  });

  it('keeps the client-importable config free of any secret name', () => {
    // lib/supabase/env.js is imported by the browser client, so a secret name
    // must never appear in it.
    const src = readFileSync(path.join(ROOT, 'lib/supabase/env.js'), 'utf8');
    expect(src).not.toMatch(/SERVICE_ROLE|SECRET_KEY|SERVICE_KEY/);
  });

  it('marks the server-only config as server-only', () => {
    const src = readFileSync(path.join(ROOT, 'lib/supabase/env.server.js'), 'utf8');
    expect(src).toMatch(/^import 'server-only';/m);
  });

  it('never imports the server Supabase module from a client component', () => {
    const offenders = files
      .filter((f) => !isTest(f))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return src.includes("'use client'") && src.includes('@/lib/supabase/server');
      })
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it('never uses dangerouslySetInnerHTML', () => {
    const offenders = files
      .filter((f) => !isTest(f) && readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'))
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it('keeps no hard-coded Supabase keys in source', () => {
    const jwtLike = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
    const offenders = files.filter((f) => jwtLike.test(readFileSync(f, 'utf8'))).map(rel);

    expect(offenders).toEqual([]);
  });

  it('guards every mutating route handler with an origin check', () => {
    const routes = files.filter((f) => /app[\\/]api[\\/].*route\.js$/.test(f));
    expect(routes.length).toBeGreaterThan(5);

    const unguarded = routes
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        const mutates = /export async function (POST|PUT|PATCH|DELETE)/.test(src);
        if (!mutates) return false;
        // Either checked inline or via the shared requireStaff/requireSuperAdmin preamble.
        return !/sameOrigin|requireStaff|requireSuperAdmin/.test(src);
      })
      .map(rel);

    expect(unguarded).toEqual([]);
  });

  it('validates every route handler body with a Zod schema', () => {
    const routes = files.filter((f) => /app[\\/]api[\\/].*route\.js$/.test(f));

    const unvalidated = routes
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        if (!/export async function (POST|PUT|PATCH)/.test(src)) return false;
        return !/safeParse|z\.object|Schema/.test(src);
      })
      .map(rel);

    expect(unvalidated).toEqual([]);
  });

  it('builds the browser client from public config only', () => {
    const src = readFileSync(path.join(ROOT, 'lib/supabase/browser.js'), 'utf8');
    expect(src).toMatch(/from '\.\/env'/);
    expect(src).not.toMatch(/env\.server/);
    expect(src).not.toMatch(/SERVICE_ROLE|SECRET_KEY|SERVICE_KEY/);
  });

  it('only inlines NEXT_PUBLIC_ names into the client bundle', () => {
    const src = readFileSync(path.join(ROOT, 'lib/supabase/env.js'), 'utf8');
    const referenced = [...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);

    expect(referenced.length).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(name, `${name} is not NEXT_PUBLIC_ and would be undefined in the browser`).toMatch(
        /^NEXT_PUBLIC_/,
      );
    }
  });

  it('marks the server Supabase module as server-only', () => {
    const src = readFileSync(path.join(ROOT, 'lib/supabase/server.js'), 'utf8');
    expect(src).toMatch(/^import 'server-only';/m);
  });
});

describe('database migrations', () => {
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ name: f, body: readFileSync(path.join(migrationsDir, f), 'utf8') }));

  it('ships every migration file', () => {
    expect(sql.map((s) => s.name)).toEqual([
      '0001_schema.sql',
      '0002_functions.sql',
      '0003_rls.sql',
      '0004_rate_limit_audit.sql',
      '0005_seed.sql',
      '0006_views.sql',
      '0007_grants.sql',
      '0008_global_views.sql',
      '0009_webauthn.sql',
      '0010_fix_rls_recursion.sql',
      '0011_staff_must_change_password.sql',
      '0012_create_schedule_rpc.sql',
      '0013_question_titles.sql',
      '0014_schedule_staff_assignment.sql',
      '0015_manager_trip_control.sql',
      '0016_question_sections.sql',
      '0017_question_review_queue.sql',
      '0018_leave_schedule.sql',
      '0019_grant_entry_date.sql',
    ]);
  });

  it('enables and forces RLS on every application table', () => {
    const rls = sql.find((s) => s.name === '0003_rls.sql').body;
    const tables = [
      'app_users',
      'schedules',
      'schedule_staff',
      'groups',
      'students',
      'question_library',
      'questions',
      'answers',
      'criteria',
      'point_events',
    ];

    for (const table of tables) {
      expect(rls).toContain(`alter table ${table}`.padEnd(0) + ''.concat(''));
      expect(rls).toMatch(new RegExp(`alter table ${table}\\s+enable row level security`));
      expect(rls).toMatch(new RegExp(`alter table ${table}\\s+force row level security`));
    }
  });

  it('pins search_path on every SECURITY DEFINER function', () => {
    for (const { name, body } of sql) {
      // Strip line comments first: prose mentioning SECURITY DEFINER is not a definition.
      const code = body.replace(/--[^\n]*/g, '');
      const definers = code.split(/security definer/i).slice(1);
      for (const chunk of definers) {
        const head = chunk.slice(0, 200);
        expect(head, `${name} has a SECURITY DEFINER function without a pinned search_path`).toMatch(
          /set search_path\s*=\s*pg_catalog, public/,
        );
      }
    }
  });

  it('creates every view with security_invoker so RLS still applies', () => {
    for (const { name, body } of sql) {
      const views = body.match(/create or replace view\s+\w+([\s\S]{0,120})/gi) ?? [];
      for (const view of views) {
        expect(view, `${name} defines a view without security_invoker`).toMatch(
          /security_invoker\s*=\s*on/i,
        );
      }
    }
  });

  it('revokes update and delete on the audit log', () => {
    const audit = sql.find((s) => s.name === '0004_rate_limit_audit.sql').body;
    expect(audit).toMatch(/revoke update, delete on audit_log/i);
    expect(audit).not.toMatch(/create policy \w+ on audit_log for (update|delete)/i);
  });

  it('re-checks authorization inside the SECURITY DEFINER grant functions', () => {
    const grants = sql.find((s) => s.name === '0007_grants.sql').body;
    const functions = grants.split(/create or replace function/i).slice(1);
    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      expect(fn).toMatch(/if not is_staff_of\(/);
    }
  });
});
