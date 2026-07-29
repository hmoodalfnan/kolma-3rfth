-- Deeds tracker: surface بنود that managers invent, without taking their trip
-- out of their hands.
--
-- A manager who writes a genuinely good بند has no way to offer it to anyone
-- else, and the super admin has no way to notice it. This flags an original بند
-- created by a manager as pending review. Accepting copies it into the shared
-- library; dismissing only clears the flag. Neither touches the manager's trip —
-- students may already have answered it, and a review is an editorial judgement
-- about the library, not a veto over somebody's trip.
--
-- Only originals qualify. A بند copied from the library carries library_id, so
-- editing it is a local change to one trip and never reaches this queue: that
-- is exactly the "edits stay local" rule.
--
-- Safe to re-run.

alter table questions
  add column if not exists review_state text not null default 'none'
  check (review_state in ('none', 'pending', 'accepted', 'dismissed'));

alter table questions
  add column if not exists created_by uuid references app_users(id) on delete set null;

create index if not exists questions_pending_review
  on questions (review_state) where review_state = 'pending';

-- Set on insert rather than trusted from the client: the browser knows the
-- caller's role, but it is not the authority on it.
create or replace function questions_tag_review() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());

  if new.library_id is null and app_role() = 'manager' then
    new.review_state := 'pending';
  end if;

  return new;
end $$;

drop trigger if exists questions_review_tag on questions;
create trigger questions_review_tag
  before insert on questions
  for each row execute function questions_tag_review();

-- Copy a suggested بند into the shared library. Runs as the definer because
-- question_library is super-admin-only for writes, so the check below is the
-- whole authorisation.
create or replace function accept_suggested_question(p_question uuid)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  q         questions;
  new_id    uuid;
  next_sort int;
begin
  if not is_super_admin() then
    raise exception 'غير مصرح — هذا الإجراء للمشرف العام فقط';
  end if;

  select * into q from questions where id = p_question;
  if q.id is null then
    raise exception 'البند غير موجود';
  end if;

  if exists (select 1 from question_library where lower(btrim(title)) = lower(btrim(q.title))) then
    raise exception 'يوجد بند بهذا العنوان في المكتبة بالفعل';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_sort from question_library;

  insert into question_library (section, title, help_text, type, config, points, sort_order)
  values (q.section, q.title, q.help_text, q.type, q.config, q.points, next_sort)
  returning id into new_id;

  -- The trip keeps its own copy untouched; this only records that the
  -- suggestion was dealt with.
  update questions set review_state = 'accepted' where id = p_question;

  return new_id;
end $$;

create or replace function dismiss_suggested_question(p_question uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not is_super_admin() then
    raise exception 'غير مصرح — هذا الإجراء للمشرف العام فقط';
  end if;

  -- Deliberately does not delete anything: the بند stays in the trip that
  -- created it, answers and all.
  update questions set review_state = 'dismissed' where id = p_question;
end $$;

grant execute on function accept_suggested_question(uuid)  to authenticated;
grant execute on function dismiss_suggested_question(uuid) to authenticated;
