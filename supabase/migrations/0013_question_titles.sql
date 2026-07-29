-- Deeds tracker: drop the rak'ah count from the sunnah titles.
--
-- "سنة الظهر القبلية (4 ركعات)" carried a detail nobody was checking a box
-- about — the box means "I prayed it", and the count only made the label longer
-- on a phone. The seed no longer produces them; this repairs the rows already
-- created from it, including the copies inside live trips.
--
-- Matches a trailing parenthesis containing ركعة or ركعات in any form, so a
-- title someone typed by hand is cleaned up the same way. Titles without one are
-- left untouched.
--
-- Safe to re-run.

update question_library
set title = btrim(regexp_replace(title, '\s*\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$', ''))
where title ~ '\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$';

update questions
set title = btrim(regexp_replace(title, '\s*\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$', ''))
where title ~ '\((?:[^()]*)(?:ركعة|ركعتان|ركعتين|ركعات)(?:[^()]*)\)\s*$';
