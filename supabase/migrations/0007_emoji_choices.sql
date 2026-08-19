-- Move the registration emoji gallery into an admin-managed table.
--
-- The set a user picks their leaderboard identity from used to be a hardcoded
-- array. This table lets admins add or remove options at /admin/emojis. Reads are
-- public because an anonymous registrant must load the gallery before they have a
-- session; writes are admin-only. Seeded with the default set (cars / flowers /
-- hearts / buildings / sky).

create table if not exists emoji_choices (
  id         uuid primary key default gen_random_uuid(),
  emoji      text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists emoji_choices_order_idx on emoji_choices (sort_order);

alter table emoji_choices enable row level security;
alter table emoji_choices force row level security;

-- Public gallery: anon registrants read it; only admins change it.
drop policy if exists emoji_choices_read on emoji_choices;
create policy emoji_choices_read on emoji_choices for select to anon, authenticated
  using (true);

drop policy if exists emoji_choices_write on emoji_choices;
create policy emoji_choices_write on emoji_choices for all to authenticated
  using (is_admin()) with check (is_admin());

-- Seed the default gallery, preserving array order as sort_order.
insert into emoji_choices (emoji, sort_order)
select emoji, (ord * 10)::int
from unnest(array[
  '🚗','🚙','🏎️','🚕','🚌','🚐','🚓','🚑','🚒','🚚','🏍️','🛵','🚲','🛺',
  '🌸','🌹','🌻','🌷','🌼','🌺','💐','🏵️','🌵','🌲','🌴','🍀','🌿','🪷',
  '❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💗','💖','💝',
  '🕌','🏛️','🏰','🏯','🏠','🏢','🏬','🏥','🏙️','🗼','🏦','🏨',
  '🌟','⭐','🌙','☀️','☁️','🌤️','⛅','❄️','⚡','💫','🌠','🪐'
]) with ordinality as t(emoji, ord)
on conflict (emoji) do nothing;
