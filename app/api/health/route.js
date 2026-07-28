import { createServiceClient, configStatus } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/http/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment self-check.
 *
 * Reports only whether each credential is *present* and whether the database
 * answers — never a key or any fragment of one. The Supabase project ref is
 * already public (it is the hostname of the project URL), so echoing it back
 * reveals nothing new while making a wrong-project mistake obvious.
 *
 * Deliberately not wrapped in safeHandler: this endpoint exists to surface
 * failures, so it must never mask its own.
 */
export async function GET() {
  const status = configStatus();
  const { present, acceptedNames } = status;

  const missing = [];
  if (!present.url) missing.push({ need: 'Supabase project URL', acceptedNames: acceptedNames.url });
  if (!present.publicKey) {
    missing.push({ need: 'anon / publishable key', acceptedNames: acceptedNames.publicKey });
  }
  if (!present.secretKey) {
    missing.push({ need: 'service role / secret key', acceptedNames: acceptedNames.secretKey });
  }

  const warnings = [];
  if (present.url && present.publicKey && !status.browserReady) {
    warnings.push(
      'The server can reach Supabase but the browser cannot: the URL and anon key must use a NEXT_PUBLIC_ prefixed name to be included in the client bundle.',
    );
  }

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
    {
      ok: missing.length === 0 && database === 'ok' && warnings.length === 0,
      projectRef: status.projectRef,
      present,
      browserReady: status.browserReady,
      authEmailDomain: status.authEmailDomain,
      missing,
      warnings,
      database,
      detail,
    },
    200,
  );
}
