-- Deeds tracker: master question library seed and default criteria.

insert into question_library (section, title, type, config, points, sort_order) values
  ('السنن الرواتب', 'سنة الفجر',                   'bool', '{}', 5, 1),
  ('السنن الرواتب', 'سنة الظهر القبلية',           'bool', '{}', 5, 2),
  ('السنن الرواتب', 'سنة الظهر البعدية',           'bool', '{}', 5, 3),
  ('السنن الرواتب', 'سنة المغرب',                  'bool', '{}', 5, 4),
  ('السنن الرواتب', 'سنة العشاء',                  'bool', '{}', 5, 5),
  ('',              'صلاة الوتر',                   'bool', '{}', 5, 6),
  ('',              'صلاة الضحى',                   'bool', '{}', 5, 7),
  ('تكبيرة الإحرام', 'تكبيرة الإحرام مع الإمام',   'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 8),
  ('أذكار الصباح والمساء', 'أذكار الصباح',                 'bool', '{}', 5, 9),
  ('أذكار الصباح والمساء', 'أذكار المساء',                 'bool', '{}', 5, 10),
  ('أذكار الصباح والمساء', 'أذكار ما بعد الصلاة',          'per_prayer',
     '{"prayers":["fajr","dhuhr","asr","maghrib","isha"],"points_per_prayer":5}', 0, 11),
  ('إضافية',       'الذهاب للمسجد',                'single_choice',
     '{"options":[{"id":"walk","label":"مشياً","points":5},{"id":"ride","label":"بسيارة","points":3},{"id":"none","label":"لم أذهب","points":0}]}',
     0, 12),
  ('إضافية',       'كم صفحة قرأت من القرآن؟',      'counter',
     '{"points_per_unit":1,"max":60,"unit_label":"صفحة"}', 0, 13),
  ('إضافية',       'تقييمك لخشوعك اليوم',          'rating',
     '{"max":5,"points_per_star":1}', 0, 14),
  ('إضافية',       'ملاحظاتك لهذا اليوم',          'text',
     '{"max_length":500}', 0, 15);

-- Applied to every new schedule by the application.
create or replace function seed_default_criteria(p_schedule uuid)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  insert into criteria (schedule_id, name, allow_negative, sort_order) values
    (p_schedule, 'الالتزام بالوقت', true,  1),
    (p_schedule, 'نظافة الغرفة',    true,  2),
    (p_schedule, 'السلوك',          true,  3),
    (p_schedule, 'المبادرة',        false, 4)
  on conflict (schedule_id, name) do nothing;
$$;
