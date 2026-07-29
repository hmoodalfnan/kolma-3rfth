-- Deeds tracker: tidy the seeded section names.
--
-- "قيام وضحى" grouped two deeds that stand on their own, and the heading was
-- doing no work: الوتر and الضحى read fine ungrouped. Clearing the section is
-- enough — groupBySection files anything without one under "عام".
--
-- "الأذكار" becomes "أذكار الصباح والمساء", which is what its contents actually
-- are, and matches how they are referred to out loud.
--
-- Both the library and the copies already inside live trips are updated, so a
-- running trip does not keep the old headings.
--
-- Safe to re-run.

update question_library set section = '' where section = 'قيام وضحى';
update questions        set section = '' where section = 'قيام وضحى';

update question_library set section = 'أذكار الصباح والمساء' where section = 'الأذكار';
update questions        set section = 'أذكار الصباح والمساء' where section = 'الأذكار';
