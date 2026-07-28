'use client';

import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { PRAYERS, PRAYER_LABELS } from '@/lib/questions/types';

export function PerPrayerConfig({ config, onChange }) {
  const prayers = config.prayers ?? [...PRAYERS];

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold">الصلوات المشمولة</legend>
        <div className="flex flex-wrap gap-2">
          {PRAYERS.map((p) => {
            const on = prayers.includes(p);
            return (
              <label
                key={p}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  on ? 'border-navy-700 bg-navy-50' : 'border-line'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={PRAYER_LABELS[p]}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      prayers: e.target.checked
                        ? PRAYERS.filter((x) => prayers.includes(x) || x === p)
                        : prayers.filter((x) => x !== p),
                    })
                  }
                  className="size-4 accent-[color:var(--color-navy-700)]"
                />
                {PRAYER_LABELS[p]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="النقاط لكل صلاة" htmlFor="ppp">
        <Input
          id="ppp"
          type="number"
          value={config.points_per_prayer ?? 1}
          onChange={(e) => onChange({ ...config, points_per_prayer: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}

export function ChoiceConfig({ config, onChange }) {
  const options = config.options ?? [];

  const patch = (next) => onChange({ ...config, options: next });

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    patch(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">الخيارات</p>

      {options.map((opt, index) => (
        <div key={opt.id} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`نص الخيار ${index + 1}`}
            value={opt.label}
            onChange={(e) =>
              patch(options.map((o, i) => (i === index ? { ...o, label: e.target.value } : o)))
            }
            className="min-w-40 flex-1"
          />
          <Input
            aria-label={`نقاط الخيار ${index + 1}`}
            type="number"
            value={opt.points}
            onChange={(e) =>
              patch(options.map((o, i) => (i === index ? { ...o, points: Number(e.target.value) } : o)))
            }
            className="w-24"
          />
          <button
            type="button"
            aria-label={`تحريك الخيار "${opt.label}" لأعلى`}
            onClick={() => move(index, -1)}
            className="size-10 rounded-lg border border-line"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`تحريك الخيار "${opt.label}" لأسفل`}
            onClick={() => move(index, 1)}
            className="size-10 rounded-lg border border-line"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`حذف الخيار "${opt.label}"`}
            disabled={options.length <= 2}
            onClick={() => patch(options.filter((_, i) => i !== index))}
            className="size-10 rounded-lg border border-line text-rose-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>
      ))}

      <Button
        tone="outline"
        onClick={() =>
          patch([
            ...options,
            { id: `opt_${Date.now().toString(36)}`, label: 'خيار جديد', points: 0 },
          ])
        }
      >
        إضافة خيار
      </Button>
      <p className="text-xs text-muted">
        يمكن أن تكون النقاط سالبة للخصم. معرّفات الخيارات ثابتة تلقائياً حتى لا تتأثر الإجابات
        السابقة.
      </p>
    </div>
  );
}

export function CounterConfig({ config, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="النقاط لكل وحدة" htmlFor="ppu">
        <Input
          id="ppu"
          type="number"
          value={config.points_per_unit ?? 1}
          onChange={(e) => onChange({ ...config, points_per_unit: Number(e.target.value) })}
        />
      </Field>
      <Field label="الحد الأقصى" htmlFor="cmax">
        <Input
          id="cmax"
          type="number"
          min={1}
          value={config.max ?? 1}
          onChange={(e) => onChange({ ...config, max: Number(e.target.value) })}
        />
      </Field>
      <Field label="اسم الوحدة" htmlFor="cunit" hint="مثل: صفحة">
        <Input
          id="cunit"
          value={config.unit_label ?? ''}
          onChange={(e) => onChange({ ...config, unit_label: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function RatingConfig({ config, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="عدد النجوم" htmlFor="rmax">
        <Select
          id="rmax"
          value={config.max ?? 5}
          onChange={(e) => onChange({ ...config, max: Number(e.target.value) })}
        >
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="النقاط لكل نجمة" htmlFor="rpps">
        <Input
          id="rpps"
          type="number"
          value={config.points_per_star ?? 1}
          onChange={(e) => onChange({ ...config, points_per_star: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}

export function TextConfig({ config, onChange }) {
  return (
    <Field label="الحد الأقصى للأحرف" htmlFor="tmax">
      <Input
        id="tmax"
        type="number"
        min={1}
        max={2000}
        value={config.max_length ?? 500}
        onChange={(e) => onChange({ ...config, max_length: Number(e.target.value) })}
      />
    </Field>
  );
}

export const CONFIG_EDITORS = {
  bool: null,
  per_prayer: PerPrayerConfig,
  single_choice: ChoiceConfig,
  multi_choice: ChoiceConfig,
  counter: CounterConfig,
  rating: RatingConfig,
  text: TextConfig,
};
