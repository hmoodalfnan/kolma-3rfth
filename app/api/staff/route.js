import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { validateStaffPassword } from '@/lib/auth/password';
import { staffEmail, isValidUsername, normalizeUsername } from '@/lib/auth/identity';
import { writeAudit } from '@/lib/audit/write';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z
  .object({
    action: z.literal('create'),
    username: z.string(),
    displayName: z.string().trim().min(1).max(120),
    role: z.enum(['manager', 'super_admin']),
    password: z.string().min(8).max(128),
  })
  .strict();

const updateSchema = z
  .object({
    action: z.literal('update'),
    userId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(['manager', 'super_admin']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const passwordSchema = z
  .object({
    action: z.literal('reset_password'),
    userId: z.string().uuid(),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

const assignSchema = z
  .object({
    action: z.literal('assign'),
    userId: z.string().uuid(),
    scheduleIds: z.array(z.string().uuid()).max(200),
  })
  .strict();

const bodySchema = z.discriminatedUnion('action', [
  createSchema,
  updateSchema,
  passwordSchema,
  assignSchema,
]);

async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'staff', limit: 100 });
  if (ctx.response) return ctx.response;
  const { db, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const input = parsed.data;

  const audit = (entry) =>
    writeAudit(db, {
      actorLabel: profile.username,
      actorRole: profile.role,
      entityType: 'app_user',
      ip: clientIp(request),
      userAgent: userAgent(request),
      ...entry,
    });

  if (input.action === 'create') {
    if (!isValidUsername(input.username)) {
      return json({ error: 'اسم المستخدم غير صالح (3-32 حرفاً إنجليزياً أو رقماً)' }, 400);
    }
    const username = normalizeUsername(input.username);

    const policy = validateStaffPassword(input.password);
    if (!policy.ok) return json({ error: policy.error }, 400);

    const { data: taken } = await db
      .from('app_users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (taken) return json({ error: 'اسم المستخدم مستخدم بالفعل' }, 409);

    const authUser = await db.auth.admin.createUser({
      email: staffEmail(username),
      password: input.password,
      email_confirm: true,
    });
    if (authUser.error) return json({ error: 'تعذّر إنشاء الحساب' }, 500);

    const inserted = await db.from('app_users').insert({
      id: authUser.data.user.id,
      username,
      display_name: input.displayName,
      role: input.role,
      created_by: profile.id,
    });

    if (inserted.error) {
      await db.auth.admin.deleteUser(authUser.data.user.id);
      return json({ error: 'تعذّر إنشاء الحساب' }, 500);
    }

    await audit({
      entityId: authUser.data.user.id,
      action: 'create',
      after: { username, role: input.role, displayName: input.displayName },
    });
    return json({ id: authUser.data.user.id, username }, 200);
  }

  if (input.action === 'update') {
    // Guard against the system being left with no reachable administrator.
    if (input.userId === profile.id && (input.role === 'manager' || input.isActive === false)) {
      return json({ error: 'لا يمكنك تغيير صلاحياتك أو تعطيل حسابك بنفسك' }, 400);
    }

    const patch = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.role !== undefined) patch.role = input.role;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (Object.keys(patch).length === 0) return json({ error: 'لا يوجد تغيير' }, 400);

    const { data: before } = await db
      .from('app_users')
      .select('username, role, is_active, display_name')
      .eq('id', input.userId)
      .maybeSingle();
    if (!before) return json({ error: 'الحساب غير موجود' }, 404);

    const { error } = await db.from('app_users').update(patch).eq('id', input.userId);
    if (error) return json({ error: 'تعذّر التحديث' }, 500);

    await audit({ entityId: input.userId, action: 'update', before, after: patch });
    return json({ ok: true }, 200);
  }

  if (input.action === 'reset_password') {
    const policy = validateStaffPassword(input.newPassword);
    if (!policy.ok) return json({ error: policy.error }, 400);

    const updated = await db.auth.admin.updateUserById(input.userId, {
      password: input.newPassword,
    });
    if (updated.error) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);

    await audit({ entityId: input.userId, action: 'reset_password' });
    return json({ ok: true }, 200);
  }

  // assign
  const { data: target } = await db
    .from('app_users')
    .select('id, username')
    .eq('id', input.userId)
    .maybeSingle();
  if (!target) return json({ error: 'الحساب غير موجود' }, 404);

  await db.from('schedule_staff').delete().eq('user_id', input.userId);
  if (input.scheduleIds.length > 0) {
    const { error } = await db
      .from('schedule_staff')
      .insert(input.scheduleIds.map((schedule_id) => ({ schedule_id, user_id: input.userId })));
    if (error) return json({ error: 'تعذّر حفظ الإسناد' }, 500);
  }

  await audit({
    entityId: input.userId,
    action: 'assign',
    after: { username: target.username, scheduleIds: input.scheduleIds },
  });
  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/staff/route.js:POST', postHandler);
