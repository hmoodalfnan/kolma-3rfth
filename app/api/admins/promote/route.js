import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { promoteAdminSchema } from '@/lib/validation/auth';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Promote an already-registered user (they created their own account) to admin.
// Unlike /create there is no new auth user and no password — the account exists;
// we only grant the role. provision_admin is idempotent, so re-promoting is safe.
async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'admins_promote', limit: 20 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = promoteAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'طلب غير صالح' }, 400);
  }
  const { userId } = parsed.data;

  // Trust only the id from the client; read the identity from the profile row so
  // a caller cannot rename someone while promoting them.
  const { data: student, error: readErr } = await db
    .from('students')
    .select('full_name, emoji, email')
    .eq('auth_uid', userId)
    .single();
  if (readErr || !student) {
    return json({ error: 'المستخدم غير موجود' }, 404);
  }

  const { error: provError } = await scoped.rpc('provision_admin', {
    p_user: userId,
    p_display: student.full_name,
    p_emoji: student.emoji ?? null,
    p_email: student.email,
  });
  if (provError) {
    return json({ error: 'تعذّر منح صلاحيات المشرف' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    entityType: 'app_user',
    entityId: userId,
    action: 'promote_admin',
    after: { email: student.email, fullName: student.full_name },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/admins/promote/route.js:POST', postHandler);
