export const QUESTION_TYPES = Object.freeze([
  'bool',
  'per_prayer',
  'single_choice',
  'multi_choice',
  'counter',
  'rating',
  'text',
]);

export const PRAYERS = Object.freeze(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

export const PRAYER_LABELS = Object.freeze({
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
});

export const TYPE_LABELS = Object.freeze({
  bool: 'نعم / لا',
  per_prayer: 'لكل صلاة',
  single_choice: 'اختيار واحد',
  multi_choice: 'اختيار متعدد',
  counter: 'عدّاد',
  rating: 'تقييم بالنجوم',
  text: 'نص حر',
});

export const TYPE_HINTS = Object.freeze({
  bool: 'خانة واحدة يعلّمها الطالب.',
  per_prayer: 'خانة لكل صلاة مفروضة تختارها.',
  single_choice: 'يختار الطالب إجابة واحدة، ولكل إجابة نقاطها.',
  multi_choice: 'يختار الطالب أكثر من إجابة، وتُجمع نقاطها.',
  counter: 'رقم يزيده الطالب (مثل عدد الصفحات).',
  rating: 'تقييم بالنجوم من 2 إلى 10 نجوم.',
  text: 'ملاحظة نصية بدون نقاط.',
});

export const DEFAULT_CONFIG = Object.freeze({
  bool: () => ({}),
  text: () => ({ max_length: 500 }),
  per_prayer: () => ({ prayers: [...PRAYERS], points_per_prayer: 5 }),
  single_choice: () => ({
    options: [
      { id: 'opt_1', label: 'نعم', points: 5 },
      { id: 'opt_2', label: 'لا', points: 0 },
    ],
  }),
  multi_choice: () => ({
    options: [
      { id: 'opt_1', label: 'الخيار الأول', points: 5 },
      { id: 'opt_2', label: 'الخيار الثاني', points: 5 },
    ],
  }),
  counter: () => ({ points_per_unit: 1, max: 20, unit_label: '' }),
  rating: () => ({ max: 5, points_per_star: 1 }),
});
