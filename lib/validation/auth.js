import { z } from 'zod';
import { toWesternDigits } from '@/lib/auth/digits';

const uuid = z.string().uuid();

// Normalised before validation, so a PIN typed on an Arabic keyboard reaches the
// database in the same form as one typed in Western numerals — otherwise the
// same six digits would be two different secrets depending on the keyboard.
const pin = z
  .string()
  .transform(toWesternDigits)
  .refine((v) => /^[0-9]{6}$/.test(v), { message: 'الرمز يجب أن يكون 6 أرقام' });

export const loginSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('staff'),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_]{3,32}$/),
      password: z.string().min(8).max(128),
    })
    .strict(),
  z
    .object({
      mode: z.literal('student'),
      studentId: uuid,
      pin,
      slug: z.string().regex(/^[0-9a-z]{10,32}$/),
    })
    .strict(),
]);

export const changePasswordSchema = z
  .object({
    // Optional because a first-time change has no current password worth
    // proving: the account is holding a temporary one that was handed over by
    // someone else, and the person just typed it to get here. The server still
    // requires it for every other change.
    currentPassword: z.string().min(6).max(128).transform(toWesternDigits).optional(),
    newPassword: z.string().min(6).max(128).transform(toWesternDigits),
  })
  .strict();
