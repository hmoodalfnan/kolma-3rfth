import { z } from 'zod';

const uuid = z.string().uuid();

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
      pin: z.string().regex(/^[0-9]{6}$/),
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
    currentPassword: z.string().min(6).max(128).optional(),
    newPassword: z.string().min(6).max(128),
  })
  .strict();
