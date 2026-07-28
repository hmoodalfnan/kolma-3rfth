-- Deeds tracker: passkey / biometric sign-in for staff.
--
-- Staff keep their password; a passkey is an additional, faster factor bound to
-- the device's biometric sensor. Students are deliberately excluded: they share
-- devices and pick their name from a list, so a device-bound credential would
-- attach to the wrong person.

create table webauthn_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  credential_id  text not null unique,
  public_key     text not null,
  counter        bigint not null default 0,
  transports     text[],
  device_label   text not null default '',
  backed_up      boolean not null default false,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index on webauthn_credentials (user_id);

alter table webauthn_credentials enable row level security;
alter table webauthn_credentials force row level security;

-- A user may see and delete their own passkeys; a super admin may see and revoke
-- anyone's. Nobody may INSERT or UPDATE through PostgREST — registration goes
-- through the route handler, which verifies the attestation first.
create policy webauthn_read on webauthn_credentials for select to authenticated
  using (user_id = auth.uid() or is_super_admin());

create policy webauthn_delete on webauthn_credentials for delete to authenticated
  using (user_id = auth.uid() or is_super_admin());

revoke insert, update on webauthn_credentials from authenticated, anon;

-- Short-lived challenges. A challenge is single-use: verify deletes it, so a
-- captured assertion cannot be replayed.
create table webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('register', 'login')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

create index on webauthn_challenges (expires_at);

alter table webauthn_challenges enable row level security;
alter table webauthn_challenges force row level security;
-- No policies at all: reachable only by the service role inside route handlers.

create or replace function webauthn_take_challenge(p_id uuid, p_kind text)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare found_challenge text;
begin
  delete from webauthn_challenges
  where id = p_id and kind = p_kind and expires_at > now()
  returning challenge into found_challenge;

  -- Opportunistic cleanup so the table cannot grow without bound.
  delete from webauthn_challenges where expires_at < now() - interval '1 hour';

  return found_challenge;
end $$;
