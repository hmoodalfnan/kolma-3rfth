import { createServiceClient, configStatus } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/http/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment self-check.
 *
 * Reports only whether each variable is *present* and whether the database
 * answers — never a key, never a fragment of one. The Supabase project ref is
 * already public (it is the hostname in NEXT_PUBLIC_SUPABASE_URL), so echoing it
 * back reveals nothing new while making a wrong-project mistake obvious.
 *
 * Deliberately not wrapped in safeHandler: this endpoint exists to surface
 * failures, so it must never mask its own.
 */
export async function GET() {
  const { projectRef, env } = configStatus();

  const missing = Object.entries(env)
    .filter(([, present]) => present === false)
    .map(([key]) => key);

  let database = 'not_checked';
  let detail = null;

  if (missing.length === 0) {
    try {
      const db = createServiceClient();
      // A cheap round-trip that also proves the migrations ran.
      const { error } = await db.rpc('rl_hit', {
        p_key: 'health',
        p_limit: 100000,
        p_window_seconds: 60,
      });
      if (error) {
        database = 'error';
        // A missing function means migrations were not run — a deployment fact,
        // not a secret.
        detail = error.message?.slice(0, 200) ?? null;
      } else {
        database = 'ok';
      }
    } catch (err) {
      database = 'unreachable';
      detail = err?.message?.slice(0, 200) ?? null;
    }
  }

  return jsonResponse(
    { ok: missing.length === 0 && database === 'ok', projectRef, env, missing, database, detail },
    200,
  );
}
