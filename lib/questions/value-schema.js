import { z } from 'zod';
import { parseConfig } from './config-schema';

export function valueSchemaFor(question) {
  const parsed = parseConfig(question.type, question.config);
  if (!parsed.ok) return null;
  const config = parsed.data;

  switch (question.type) {
    case 'bool':
      return z.boolean();

    case 'per_prayer': {
      const shape = {};
      for (const p of config.prayers) shape[p] = z.boolean().optional();
      return z.object(shape).strict();
    }

    case 'single_choice':
      return z.enum(config.options.map((o) => o.id));

    case 'multi_choice': {
      const ids = new Set(config.options.map((o) => o.id));
      return z
        .array(z.string())
        .max(ids.size)
        .superRefine((arr, ctx) => {
          const seen = new Set();
          for (const id of arr) {
            if (!ids.has(id)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `خيار غير معروف: ${id}` });
            }
            if (seen.has(id)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `خيار مكرر: ${id}` });
            }
            seen.add(id);
          }
        });
    }

    case 'counter':
      return z.number().int().min(0).max(config.max);

    case 'rating':
      return z.number().int().min(0).max(config.max);

    case 'text':
      return z.string().max(config.max_length);

    default:
      return null;
  }
}

export function validateValue(question, value) {
  const schema = valueSchemaFor(question);
  if (!schema) return { ok: false, error: 'نوع سؤال غير معروف أو إعدادات غير صالحة' };

  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join(' — ') };
  }
  return { ok: true, data: result.data };
}
