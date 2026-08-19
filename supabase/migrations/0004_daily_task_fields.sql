-- Redesign follow-up: give daily_tasks the same organizing fields the old
-- question builder had — a category (section) and an optional active-date window
-- — so the admin can group tasks and schedule when they appear.
--
--   category    -> free-text section label; '' means uncategorized (بدون قسم)
--   active_from -> first day the task is shown to users (null = no lower bound)
--   active_to   -> last day the task is shown to users (null = no upper bound)
--
-- The window is honoured on read (useToday) and by the student RLS read policy is
-- unaffected — visibility is a UI concern; admins still see every row.

alter table daily_tasks
  add column if not exists category    text not null default '' check (length(category) <= 120),
  add column if not exists active_from  date,
  add column if not exists active_to    date;

-- Group tasks by category within a program for the admin list.
create index if not exists daily_tasks_category_idx
  on daily_tasks (schedule_id, category, sort_order)
  where archived_at is null;
