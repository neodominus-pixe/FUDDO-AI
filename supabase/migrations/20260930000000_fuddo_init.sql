-- FUDDO AI: database schema, access rules and storage.
--
-- Runs as a Supabase migration (`npx supabase start` / `npx supabase db push`), or paste it into the
-- SQL editor of a hosted project. Idempotent: safe to run more than once.
--
-- Where the security lives
--   * Passwords, sessions, refresh tokens and sign-in throttling belong to Supabase Auth (GoTrue).
--   * Every "who may see or change this row" rule is Row Level Security below, so the anon key that
--     ships to browsers can only do what these policies allow the signed-in user to do.
--   * Rules that must hold no matter which code path reaches the database (registration closed,
--     last administrator, review integrity, project ownership) are triggers and functions here,
--     not checks in application code.
--   * Sign-in attempt limiting, admin operations and the review endpoint go through SECURITY DEFINER
--     functions with a pinned search_path. Functions that only the server may call are revoked from
--     anon and authenticated.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  role       text not null default 'user' check (role in ('user', 'admin')),
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values ('registration_open', 'true'::jsonb)
  on conflict (key) do nothing;

create or replace function public.new_share_id() returns text
language sql volatile set search_path = public, extensions as
$$ select translate(encode(gen_random_bytes(12), 'base64'), '+/=', '-_') $$;

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles (id) on delete set null,
  share_id   text not null unique default public.new_share_id(),
  dish_name  text not null default 'Untitled dish',
  dish       jsonb not null,
  spread     jsonb not null,
  review     jsonb not null default '{"reviewer":"","pickedSpecId":null,"comment":"","reviewedAt":null}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dish_shape   check (jsonb_typeof(dish) = 'object' and pg_column_size(dish) < 250000),
  constraint projects_spread_shape check (jsonb_typeof(spread) = 'array' and jsonb_array_length(spread) <= 24 and pg_column_size(spread) < 500000),
  constraint projects_review_shape check (jsonb_typeof(review) = 'object' and pg_column_size(review) < 8000)
);
create index if not exists projects_owner_idx on public.projects (owner_id);

-- Images the paid providers already produced, keyed by a hash of everything that shaped the image.
-- A public review link must never trigger a paid generation, so it reads from here only.
create table if not exists public.render_cache (
  hash       text primary key,
  image_url  text not null,
  provider   text not null,
  quality    text not null,
  cost_usd   numeric(10, 4) not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_events (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  action     text not null,
  target     text not null,
  created_at timestamptz not null default now()
);

-- Emails an administrator has just approved. Lets an admin create an account while public sign-up is closed.
-- Short-lived and single-use; only the server (service role) can write to it.
create table if not exists public.registration_allow (
  email      text primary key,
  expires_at timestamptz not null
);

create table if not exists public.rate_limits (
  key        text primary key,
  count      integer not null,
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and not disabled) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not disabled) $$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = 'PT401'; end if;
  if not public.is_admin() then raise exception 'Administrator access required.' using errcode = 'PT403'; end if;
end $$;

create or replace function public.audit(p_action text, p_target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_events (actor_id, actor_name, action, target)
  select p.id, p.name, left(p_action, 200), left(p_target, 500) from public.profiles p where p.id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window per key). Server-only: never callable from a browser.
-- ---------------------------------------------------------------------------

-- Records p_cost hits and reports whether the key is now over its budget (count > limit).
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window interval, p_cost integer default 1) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if random() < 0.02 then delete from public.rate_limits where expires_at < now() - interval '1 day'; end if;
  insert into public.rate_limits as r (key, count, expires_at) values (p_key, greatest(p_cost, 1), now() + p_window)
  on conflict (key) do update set
    count = case when r.expires_at < now() then greatest(p_cost, 1) else r.count + greatest(p_cost, 1) end,
    expires_at = case when r.expires_at < now() then now() + p_window else r.expires_at end
  returning count into v_count;
  return v_count > p_limit;
end $$;

-- Reports whether a key has used up its budget (count >= limit) without counting a hit.
-- Pair with hit_rate_limit, which reports whether a hit went over budget (count > limit).
create or replace function public.is_rate_limited(p_key text, p_limit integer) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select count >= p_limit from public.rate_limits where key = p_key and expires_at >= now()), false) $$;

create or replace function public.clear_rate_limit(p_key text) returns void
language sql security definer set search_path = public as
$$ delete from public.rate_limits where key = p_key $$;

revoke all on function public.hit_rate_limit(text, integer, interval, integer) from public, anon, authenticated;
revoke all on function public.is_rate_limited(text, integer) from public, anon, authenticated;
revoke all on function public.clear_rate_limit(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts: profile creation, closed registration
-- ---------------------------------------------------------------------------

-- Enforced here, not in the app, because anyone holding the anon key can call the Auth API directly.
-- An administrator creating an account while sign-up is closed first records that exact email in
-- registration_allow (service role only). GoTrue sets app_metadata after inserting the user, so a flag on the
-- user row itself would not be visible here yet.
create or replace function public.enforce_registration() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select value from public.settings where key = 'registration_open'), 'true'::jsonb) = 'true'::jsonb then
    return new;
  end if;
  if exists (select 1 from public.registration_allow where email = lower(new.email) and expires_at > now()) then
    delete from public.registration_allow where email = lower(new.email);
    return new;
  end if;
  raise exception 'Registration is currently closed. Contact the studio administrator.';
end $$;

create or replace function public.allow_registration(p_email text) returns void
language sql security definer set search_path = public as $$
  insert into public.registration_allow (email, expires_at) values (lower(trim(p_email)), now() + interval '2 minutes')
  on conflict (email) do update set expires_at = excluded.expires_at
$$;
revoke all on function public.allow_registration(text) from public, anon, authenticated;

drop trigger if exists fuddo_enforce_registration on auth.users;
create trigger fuddo_enforce_registration before insert on auth.users
  for each row execute function public.enforce_registration();

-- Every profile starts as a regular user. The role is never read from client-controlled metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Chef'), 100)
  );
  return new;
end $$;

drop trigger if exists fuddo_handle_new_user on auth.users;
create trigger fuddo_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone may ask whether sign-up is open (the auth page shows a message when it is not).
create or replace function public.registration_open() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select value = 'true'::jsonb from public.settings where key = 'registration_open'), true) $$;

-- ---------------------------------------------------------------------------
-- Projects: integrity guard
-- ---------------------------------------------------------------------------

create or replace function public.projects_guard() returns trigger
language plpgsql as $$
begin
  new.dish_name := left(coalesce(nullif(trim(new.dish ->> 'name'), ''), 'Untitled dish'), 200);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if not public.is_admin() then
      -- Owners cannot hand a project to someone else or pick their own review link.
      new.owner_id := old.owner_id;
      new.share_id := old.share_id;
      -- Only the review function (or an administrator) may write a consultant's answer.
      if coalesce(current_setting('fuddo.review_write', true), '') <> '1' then
        new.review := old.review;
      end if;
    end if;
    -- A pick of a plating that no longer exists means nothing; drop it rather than show a stale answer.
    if new.review ->> 'pickedSpecId' is not null and not exists (
      select 1 from jsonb_array_elements(new.spread) e where e -> 'spec' ->> 'id' = new.review ->> 'pickedSpecId'
    ) then
      new.review := jsonb_set(jsonb_set(new.review, '{pickedSpecId}', 'null'::jsonb), '{reviewedAt}', 'null'::jsonb);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fuddo_projects_guard on public.projects;
create trigger fuddo_projects_guard before insert or update on public.projects
  for each row execute function public.projects_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.settings     enable row level security;
alter table public.projects     enable row level security;
alter table public.render_cache enable row level security;
alter table public.admin_events enable row level security;
alter table public.rate_limits  enable row level security;
alter table public.registration_allow enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- People may rename themselves and nothing else; role and status change only through admin functions.
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active()) with check (id = auth.uid());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.settings from anon, authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin());

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_active()) or public.is_admin());

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using ((owner_id = auth.uid() and public.is_active()) or public.is_admin());

drop policy if exists admin_events_select on public.admin_events;
create policy admin_events_select on public.admin_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.admin_events from anon, authenticated;

-- render_cache and rate_limits have no policies: only the service role (which bypasses RLS) touches them.
revoke all on public.render_cache from anon, authenticated;
revoke all on public.rate_limits  from anon, authenticated;
revoke all on public.registration_allow from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consultant review (no account; the share link is the credential)
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_project(p_share_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'dish', dish, 'spread', spread, 'review', review)
  from public.projects
  where share_id = p_share_id and char_length(p_share_id) between 8 and 64
$$;

create or replace function public.submit_review(p_share_id text, p_reviewer text, p_picked text, p_comment text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_review  jsonb;
begin
  if char_length(coalesce(p_share_id, '')) not between 8 and 64 then
    raise exception 'This review link is not valid.' using errcode = 'PT404';
  end if;

  select * into v_project from public.projects where share_id = p_share_id for update;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'PT404';
  end if;

  -- Backstop behind the per-IP limit in the API: a link cannot be hammered by many clients at once.
  if public.hit_rate_limit('review:' || v_project.id::text, 60, interval '1 hour') then
    raise exception 'This link has received too many answers. Try again later.' using errcode = 'PT429';
  end if;

  if p_picked is not null and not exists (
    select 1 from jsonb_array_elements(v_project.spread) e where e -> 'spec' ->> 'id' = p_picked
  ) then
    raise exception 'That plating is not part of this spread.' using errcode = 'PT400';
  end if;

  v_review := jsonb_build_object(
    'reviewer',    left(coalesce(p_reviewer, ''), 80),
    'pickedSpecId', p_picked,
    'comment',     left(coalesce(p_comment, ''), 2000),
    'reviewedAt',  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  perform set_config('fuddo.review_write', '1', true);
  update public.projects set review = v_review where id = v_project.id;
  return v_review;
end $$;

revoke all on function public.get_shared_project(text) from public;
revoke all on function public.submit_review(text, text, text, text) from public;
revoke all on function public.registration_open() from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
grant execute on function public.submit_review(text, text, text, text) to anon, authenticated;
grant execute on function public.registration_open() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Administration. Every function checks the caller, writes the audit trail, and is
-- invisible to non-admins. Operations that need the Auth admin API (create user, set
-- password, change email, ban) are orchestrated by the server with the service key.
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'email', u.email, 'role', p.role,
        'disabled', case when p.disabled then 1 else 0 end,
        'createdAt', p.created_at, 'lastLoginAt', u.last_sign_in_at,
        'sessions', (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
        'projects', (select count(*) from public.projects pr where pr.owner_id = p.id)
      ) order by p.created_at desc)
      from public.profiles p join auth.users u on u.id = p.id), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.dish_name, 'ownerId', coalesce(pr.owner_id::text, ''), 'shareId', pr.share_id,
        'platings', jsonb_array_length(pr.spread), 'reviewed', (pr.review ->> 'reviewedAt') is not null,
        'updatedAt', pr.updated_at
      ) order by pr.updated_at desc) from public.projects pr), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'actorName', e.actor_name, 'action', e.action, 'target', e.target, 'createdAt', e.created_at) order by e.id desc)
      from (select * from public.admin_events order by id desc limit 100) e), '[]'::jsonb),
    'registrationOpen', public.registration_open()
  ) into v;
  return v;
end $$;

-- Validates a role/status change against the rules that must always hold.
create or replace function public.admin_check_profile_update(p_id uuid, p_role text, p_disabled boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_target public.profiles;
begin
  perform public.require_admin();
  if p_role not in ('user', 'admin') then raise exception 'Invalid role.' using errcode = 'PT400'; end if;
  select * into v_target from public.profiles where id = p_id;
  if not found then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  if p_id = auth.uid() and (p_disabled or p_role <> 'admin') then
    raise exception 'You cannot suspend or demote your own account.' using errcode = 'PT400';
  end if;
  if v_target.role = 'admin' and not v_target.disabled and (p_disabled or p_role <> 'admin')
     and (select count(*) from public.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'At least one active administrator must remain.' using errcode = 'PT400';
  end if;
end $$;

create or replace function public.admin_apply_profile_update(p_id uuid, p_name text, p_email text, p_role text, p_disabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old   public.profiles;
  v_email text;
begin
  perform public.require_admin();
  -- Serialise administrator changes so two admins cannot demote each other at the same moment.
  perform pg_advisory_xact_lock(hashtext('fuddo-admins'));
  perform public.admin_check_profile_update(p_id, p_role, p_disabled);
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'Enter a name.' using errcode = 'PT400'; end if;

  select * into v_old from public.profiles where id = p_id;
  select email into v_email from auth.users where id = p_id;

  update public.profiles set name = trim(p_name), role = p_role, disabled = p_disabled where id = p_id;

  -- Suspension and role changes end existing sessions; an email change was already applied by the server.
  if p_disabled or v_old.role <> p_role or v_old.disabled <> p_disabled or lower(coalesce(v_email, '')) <> lower(coalesce(p_email, '')) then
    delete from auth.sessions where user_id = p_id;
  end if;
  perform public.audit('Updated account', coalesce(p_email, v_email) || ' → ' || p_role || '; ' || case when p_disabled then 'suspended' else 'active' end);
end $$;

create or replace function public.admin_revoke_sessions(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  perform public.require_admin();
  select email into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  delete from auth.sessions where user_id = p_id;
  perform public.audit('Revoked all sessions', v_email);
end $$;

create or replace function public.admin_clear_attempts(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text;
begin
  perform public.require_admin();
  select lower(trim(email)) into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  delete from public.rate_limits where key like 'acct:' || encode(digest(v_email, 'sha256'), 'hex') || ':%';
  perform public.audit('Cleared sign-in attempt limit', v_email);
end $$;

create or replace function public.admin_set_registration(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  insert into public.settings (key, value) values ('registration_open', to_jsonb(p_open))
    on conflict (key) do update set value = excluded.value;
  perform public.audit(case when p_open then 'Opened registration' else 'Closed registration' end, 'Workspace');
end $$;

create or replace function public.admin_update_project(p_id uuid, p_name text, p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.projects;
begin
  perform public.require_admin();
  select * into v_old from public.projects where id = p_id;
  if not found then raise exception 'Project not found.' using errcode = 'PT404'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'Enter a project name.' using errcode = 'PT400'; end if;
  if not exists (select 1 from public.profiles where id = p_owner and not disabled) then
    raise exception 'Choose an active account as owner.' using errcode = 'PT400';
  end if;
  update public.projects set dish = jsonb_set(dish, '{name}', to_jsonb(trim(p_name))), owner_id = p_owner where id = p_id;
  perform public.audit('Updated project', v_old.dish_name || ' → ' || trim(p_name) || '; owner ' || p_owner::text);
end $$;

create or replace function public.admin_rotate_share(p_id uuid, p_confirm text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_old public.projects;
  v_new text := public.new_share_id();
begin
  perform public.require_admin();
  select * into v_old from public.projects where id = p_id;
  if not found then raise exception 'Project not found.' using errcode = 'PT404'; end if;
  if p_confirm is distinct from v_old.dish_name then raise exception 'Type the project name to replace its review link.' using errcode = 'PT400'; end if;
  update public.projects set share_id = v_new where id = p_id;
  perform public.audit('Replaced review link', v_old.dish_name);
  return v_new;
end $$;

create or replace function public.admin_record(p_action text, p_target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  perform public.audit(p_action, p_target);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_overview()', 'admin_check_profile_update(uuid, text, boolean)',
    'admin_apply_profile_update(uuid, text, text, text, boolean)', 'admin_revoke_sessions(uuid)',
    'admin_clear_attempts(uuid)', 'admin_set_registration(boolean)', 'admin_update_project(uuid, text, uuid)',
    'admin_rotate_share(uuid, text)', 'admin_record(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- audit() and the helpers are internal; nothing outside the database may call them directly.
revoke all on function public.audit(text, text) from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: component photos and generated plating images
--   media/<user id>/...   uploaded by that user (JPEG/PNG/WebP, 12 MB)
--   media/generated/...   written only by the server (service role)
-- Objects are publicly readable by URL, like any image on the web; paths are unguessable.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 12582912, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_insert_own on storage.objects;
create policy media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active());

-- Storage finds an object through SELECT before it deletes or replaces it, so owners need to see their own
-- folder. Public reads by URL do not use this policy (the bucket is public); other people's folders stay invisible.
drop policy if exists media_select_own on storage.objects;
create policy media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists media_delete_own on storage.objects;
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
