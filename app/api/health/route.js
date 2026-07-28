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

  // An easy trap: SUPABASE_TEST_* are read only by the database test harness,
  // never by the app. Say so plainly rather than reporting a bare "missing".
  const hasTestVars = Object.keys(process.env).some((k) => k.startsWith('SUPABASE_TEST_'));
  if (hasTestVars && missing.length > 0) {
    const needed = [
      acceptedNames.url[0],
      acceptedNames.publicKey[0],
      acceptedNames.secretKey[0],
    ].join(', ');

    warnings.push(
      `SUPABASE_TEST_* variables are set, but those are only read by the database test suite. The app needs: ${needed}.`,
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

  // Variable NAMES only — never a value, not even a prefix. This is what tells
  // you whether a credential was saved under an unexpected name, saved to the
  // wrong environment, or simply never saved.
  const relevant = /SUPABASE|AUTH_EMAIL|WEBAUTHN/i;
  const seenNames = Object.keys(process.env).filter((k) => relevant.test(k)).sort();

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
      diagnostics: {
        // If this array is empty, nothing Supabase-related reached this build.
        supabaseVarNamesSeen: seenNames,
        vercelEnv: process.env.VERCEL_ENV ?? null,
        deploymentUrl: process.env.VERCEL_URL ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
    },
    200,
  );
}
