-- FUDDO AI: roles as a real list, and deciding a person's role from Supabase.
--
--   1. profiles.role becomes the enum `user_role` ('user', 'admin'), so Supabase's Table Editor shows a
--      dropdown instead of a free-text box, and a typo is impossible. Everyone defaults to 'user'.
--   2. role_invites lets you decide a role BEFORE the person signs up: add their email and a role, and the
--      account gets that role as soon as it exists and its email is confirmed. No invite means 'user'.
--
-- Choosing a role from Supabase, any of these:
--   * Table Editor ▸ profiles ▸ click the role cell ▸ pick from the list.
--   * Table Editor ▸ role_invites ▸ insert a row (email, role) before you create or invite the person.
--   * SQL:  update public.profiles set role = 'admin' where email = 'someone@example.com';
--   * The app's own /admin panel (Accounts ▸ Manage ▸ Role).
--
-- ADDING MORE ROLES LATER (for example chef and consultant) is one statement per role:
--
--     alter type public.user_role add value if not exists 'chef';
--     alter type public.user_role add value if not exists 'consultant';
--
-- Run it as its own migration (Postgres does not let a new enum value be used in the same transaction that
-- adds it), then add the value to lib/roles.ts. The dropdown, the admin panel and the validation follow.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- The enum, and the column
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'user_role' and n.nspname = 'public') then
    create type public.user_role as enum ('user', 'admin');
  end if;
end $$;

comment on type public.user_role is 'Account roles. Add one with: alter type public.user_role add value ''chef'';';

do $$
begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') = 'text' then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type public.user_role using role::public.user_role;
    alter table public.profiles alter column role set default 'user';
  end if;
end $$;

comment on column public.profiles.role is 'user (default) or admin. Pick it from the dropdown, or pre-assign it with role_invites.';

-- ---------------------------------------------------------------------------
-- Admin functions, now role-aware (they took the role as text)
-- ---------------------------------------------------------------------------

-- Turns the text an API sends into a role, or reports it as a bad request.
create or replace function public.parse_role(p_role text) returns public.user_role
language plpgsql immutable as $$
begin
  return p_role::public.user_role;
exception when invalid_text_representation then
  raise exception 'Invalid role.' using errcode = 'PT400';
end $$;

create or replace function public.admin_check_profile_update(p_id uuid, p_role text, p_disabled boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_role   public.user_role;
  v_target public.profiles;
begin
  perform public.require_admin();
  v_role := public.parse_role(p_role);
  select * into v_target from public.profiles where id = p_id;
  if not found then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  if p_id = auth.uid() and (p_disabled or v_role <> 'admin') then
    raise exception 'You cannot suspend or demote your own account.' using errcode = 'PT400';
  end if;
  if v_target.role = 'admin' and not v_target.disabled and (p_disabled or v_role <> 'admin')
     and (select count(*) from public.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'At least one active administrator must remain.' using errcode = 'PT400';
  end if;
end $$;

create or replace function public.admin_apply_profile_update(p_id uuid, p_name text, p_email text, p_role text, p_disabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role  public.user_role;
  v_old   public.profiles;
  v_email text;
begin
  perform public.require_admin();
  -- Serialise administrator changes so two admins cannot demote each other at the same moment.
  perform pg_advisory_xact_lock(hashtext('fuddo-admins'));
  perform public.admin_check_profile_update(p_id, p_role, p_disabled);
  v_role := public.parse_role(p_role);
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'Enter a name.' using errcode = 'PT400'; end if;

  select * into v_old from public.profiles where id = p_id;
  select email into v_email from auth.users where id = p_id;

  update public.profiles set name = trim(p_name), role = v_role, disabled = p_disabled where id = p_id;

  if p_disabled or v_old.role <> v_role or v_old.disabled <> p_disabled or lower(coalesce(v_email, '')) <> lower(coalesce(p_email, '')) then
    delete from auth.sessions where user_id = p_id;
  end if;
  perform public.audit(
    'Updated account', coalesce(p_email, v_email) || ' → ' || v_role::text || '; ' || case when p_disabled then 'suspended' else 'active' end,
    p_id, jsonb_build_object('role', v_role, 'disabled', p_disabled, 'previousRole', v_old.role, 'wasDisabled', v_old.disabled)
  );
end $$;

revoke all on function public.parse_role(text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['admin_check_profile_update(uuid, text, boolean)', 'admin_apply_profile_update(uuid, text, text, text, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Deciding a role before the person exists
-- ---------------------------------------------------------------------------

create table if not exists public.role_invites (
  email      text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role       public.user_role not null default 'admin',
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.role_invites is 'Pre-assign a role to an email. It applies when that account exists and its email is confirmed, then the row is removed.';

-- Only you (Table Editor / SQL editor / service role) can touch it. The app and every signed-in user cannot.
alter table public.role_invites enable row level security;
revoke all on public.role_invites from anon, authenticated;

-- Emails are lower-cased on the way in, so "Chef@Example.com" in the Table Editor still matches.
create or replace function public.role_invites_normalise() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;

drop trigger if exists fuddo_role_invites_normalise on public.role_invites;
create trigger fuddo_role_invites_normalise before insert or update on public.role_invites
  for each row execute function public.role_invites_normalise();

-- A new account takes its role from a matching invite, but ONLY when its email is already confirmed, so nobody can
-- claim an invited address by signing up with it before the real owner has proven they hold it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role public.user_role := 'user';
begin
  if new.email_confirmed_at is not null then
    select i.role into v_role from public.role_invites i where i.email = lower(new.email);
    v_role := coalesce(v_role, 'user');
    delete from public.role_invites where email = lower(new.email);
  end if;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Chef'), 100),
    new.email,
    v_role
  );
  return new;
end $$;

-- ...and when an address is confirmed later (the usual email-link sign-up), apply the invite then.
create or replace function public.apply_role_invite_on_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role public.user_role;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select i.role into v_role from public.role_invites i where i.email = lower(new.email);
    if found then
      update public.profiles set role = v_role where id = new.id;
      delete from public.role_invites where email = lower(new.email);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fuddo_apply_role_invite on auth.users;
create trigger fuddo_apply_role_invite after update of email_confirmed_at on auth.users
  for each row execute function public.apply_role_invite_on_confirm();

revoke all on function public.apply_role_invite_on_confirm() from public, anon, authenticated;
revoke all on function public.role_invites_normalise() from public, anon, authenticated;
