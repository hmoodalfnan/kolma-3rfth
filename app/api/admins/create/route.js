import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { createAdminSchema } from '@/lib/validation/auth';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'admins_create', limit: 20 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = createAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'طلب غير صالح' }, 400);
  }
  const { fullName, email, password, emoji } = parsed.data;

  // Create the auth user (already confirmed — an admin vouches for it, no email
  // round-trip needed). admin_provisioned stops the self-serve trigger from also
  // inserting a profile; provision_admin does that atomically below.
  const authUser = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, admin_provisioned: true },
  });
  if (authUser.error) {
    return json(
      {
        error: /registered|exists/i.test(authUser.error.message || '')
          ? 'هذا البريد مسجّل بالفعل'
          : 'تعذّر إنشاء الحساب',
      },
      400,
    );
  }

  // provision_admin re-checks is_admin() via the caller's own token, then inserts
  // the app_users + students rows (SECURITY DEFINER, bypassing RLS).
  const { error: provError } = await scoped.rpc('provision_admin', {
    p_user: authUser.data.user.id,
    p_display: fullName,
    p_emoji: emoji ?? null,
    p_email: email,
  });

  if (provError) {
    await db.auth.admin.deleteUser(authUser.data.user.id); // roll back the orphan
    return json({ error: 'تعذّر منح صلاحيات المشرف' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    entityType: 'app_user',
    entityId: authUser.data.user.id,
    action: 'create_admin',
    after: { email, fullName },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/admins/create/route.js:POST', postHandler);
