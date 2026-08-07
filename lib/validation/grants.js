import { z } from 'zod';

export const grantSchema = z
  .object({
    scheduleId: z.string().uuid(),
    criterionId: z.string().uuid(),
    points: z
      .number()
      .finite()
      .refine((n) => n !== 0, 'النقاط يجب ألا تكون صفراً')
      .refine((n) => Math.abs(n) <= 1000, 'النقاط خارج الحدود المسموحة'),
    note: z.string().max(500).default(''),
    // The day the points are about, which is not always the day they are typed
    // in. Bounds are checked in the database against the trip's own dates and
    // its own clock, because a browser's idea of "today" is not authoritative.
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح')
      .optional(),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('student'), studentId: z.string().uuid() }).strict(),
      z
        .object({
          kind: z.literal('students'),
          studentIds: z
            .array(z.string().uuid())
            .min(1, 'اختر طالباً واحداً على الأقل')
            .max(200, 'عدد الطلاب كبير جداً')
            // Same points twice on the same student would be a real double-grant.
            .transform((ids) => [...new Set(ids)]),
        })
        .strict(),
      z
        .object({
          kind: z.literal('group'),
          groupId: z.string().uuid(),
          applyToMembers: z.boolean().default(false),
        })
        .strict(),
    ]),
  })
  .strict();
