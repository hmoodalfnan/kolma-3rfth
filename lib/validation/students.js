import { z } from 'zod';

const fullName = z
  .string()
  .trim()
  .min(1, 'الاسم مطلوب')
  .max(120, 'الاسم طويل جداً')
  .transform((v) => v.replace(/\s+/g, ' '));

export const createStudentsSchema = z
  .object({
    scheduleId: z.string().uuid(),
    groupId: z.string().uuid().nullable().optional(),
    students: z
      .array(
        z
          .object({
            full_name: fullName,
            pin: z
              .string()
              .regex(/^[0-9]{6}$/)
              .optional(),
          })
          .strict(),
      )
      .min(1, 'أضف طالباً واحداً على الأقل')
      .max(500, 'الحد الأقصى 500 طالب في المرة الواحدة'),
  })
  .strict();

export const resetPinSchema = z.object({ studentId: z.string().uuid() }).strict();

export const deleteStudentSchema = z.object({ studentId: z.string().uuid() }).strict();

export const deleteScheduleSchema = z
  .object({
    scheduleId: z.string().uuid(),
    // Checked against the stored name on the server, so a stale or guessed
    // client cannot delete a trip by id alone.
    confirmName: z.string().min(1),
  })
  .strict();

export const setActiveSchema = z
  .object({ studentId: z.string().uuid(), active: z.boolean() })
  .strict();

export const updateStudentSchema = z
  .object({
    studentId: z.string().uuid(),
    full_name: fullName.optional(),
    groupId: z.string().uuid().nullable().optional(),
  })
  .strict();
