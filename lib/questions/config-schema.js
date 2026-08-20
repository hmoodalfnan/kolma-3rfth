import { z } from 'zod';
import { QUESTION_TYPES, PRAYERS } from './types';

export { QUESTION_TYPES, PRAYERS };

const points = z.number().finite().min(-1000).max(1000);

const option = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, 'معرّف الخيار غير صالح'),
  label: z.string().min(1).max(120),
  points: points.default(0),
});

const uniqueOptions = z
  .array(option)
  .min(2, 'يجب إضافة خيارين على الأقل')
  .max(20, 'الحد الأقصى 20 خياراً')
  .superRefine((opts, ctx) => {
    const seen = new Set();
    for (const o of opts) {
      if (seen.has(o.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `معرّف الخيار مكرر: ${o.id}` });
      }
      seen.add(o.id);
    }
  });

const SCHEMAS = {
  bool: z.object({}).strip(),
  text: z.object({ max_length: z.number().int().min(1).max(2000).default(500) }).strip(),
  per_prayer: z
    .object({
      prayers: z.array(z.enum(PRAYERS)).min(1).max(5).default([...PRAYERS]),
      points_per_prayer: points.default(1),
    })
    .strip(),
  single_choice: z.object({ options: uniqueOptions }).strip(),
  multi_choice: z.object({ options: uniqueOptions }).strip(),
  counter: z
    .object({
      points_per_unit: points.default(1),
      // `max` is the hard ceiling the counter can reach; `target` is the count
      // that earns the full (100%) points. Beyond the target and up to max, extra
      // units keep scoring as bonus. `target` defaults to `max` when unset.
      max: z.number().int().min(1).max(10000),
      target: z.number().int().min(1).max(10000).optional(),
      unit_label: z.string().max(40).default(''),
    })
    .strip()
    .superRefine((cfg, ctx) => {
      if (cfg.target != null && cfg.target > cfg.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'الهدف يجب أن يكون أقل من الحد الأقصى أو مساوياً له',
          path: ['target'],
        });
      }
    }),
  rating: z
    .object({
      max: z.number().int().min(2).max(10).default(5),
      points_per_star: points.default(1),
    })
    .strip(),
};

export function configSchemaFor(type) {
  return SCHEMAS[type] ?? null;
}

export function parseConfig(type, config) {
  const schema = configSchemaFor(type);
  if (!schema) return { ok: false, error: `نوع سؤال غير معروف: ${type}` };

  const result = schema.safeParse(config ?? {});
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join(' — ') };
  }
  return { ok: true, data: result.data };
}
