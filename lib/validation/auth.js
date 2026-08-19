import { z } from 'zod';
import { toWesternDigits } from '@/lib/auth/digits';
import { isValidEmoji } from '@/lib/identity/emojis';

// Everyone now logs in with a real, verified email + password.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

// Self-registration: name, email, password (>= 8), and a chosen emoji identity.
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    emoji: z.string().refine(isValidEmoji, { message: 'اختر رمزاً من القائمة' }),
  })
  .strict();

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
