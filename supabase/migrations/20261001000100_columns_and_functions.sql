-- FUDDO AI: the columns and functions the first migration left out.
--
-- Purely additive: every new column has a default (or is nullable), so existing rows and the running app are
-- unaffected. Idempotent: safe to run more than once. Run it after 20261001000000_normalized_tables.sql.
--
--   profiles   email, avatar, organisation, job title, locale, updated_at
--   projects   description, tags, status (derived), archive, thumbnail, link on/off, link view counters
--   settings   description, who changed it and when
--   admin_events  what the action was about (target id) and structured details
--
--   for people   my_projects(), my_stats(), duplicate_project(), rotate_my_share_link(), delete_my_account()
--   for admins   admin_stats(), admin_user_detail(), admin_events_page()
--   for the app  record_link_view()
--   maintenance  purge_expired()

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists email        text;
alter table public.profiles add column if not exists avatar_url   text;
alter table public.profiles add column if not exists organisation text;
alter table public.profiles add column if not exists job_title    text;
alter table public.profiles add column if not exists locale       text not null default 'en';
alter table public.profiles add column if not exists updated_at   timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_https') then
    alter table public.profiles add constraint profiles_avatar_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 600));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_text_lengths') then
    alter table public.profiles add constraint profiles_text_lengths check (char_length(coalesce(organisation, '')) <= 120 and char_length(coalesce(job_title, '')) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_locale_shape') then
    alter table public.profiles add constraint profiles_locale_shape check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$');
  end if;
end $$;

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- The email lives in auth.users; keep a copy on the profile so it can be listed and searched with plain SQL.
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Chef'), 100),
    new.email
  );
  return new;
end $$;

create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end $$;

drop trigger if exists fuddo_sync_profile_email on auth.users;
create trigger fuddo_sync_profile_email after update of email on auth.users
  for each row execute function public.sync_profile_email();

create or replace function public.touch_profile() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists fuddo_profiles_touch on public.profiles;
create trigger fuddo_profiles_touch before update on public.profiles
  for each row execute function public.touch_profile();

-- People may edit their own details (never role, status or email).
grant update (name, avatar_url, organisation, job_title, locale) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists description     text;
alter table public.projects add column if not exists tags            text[] not null default '{}';
alter table public.projects add column if not exists archived_at     timestamptz;
alter table public.projects add column if not exists thumbnail_url   text;
alter table public.projects add column if not exists link_enabled    boolean not null default true;
alter table public.projects add column if not exists view_count      integer not null default 0;
alter table public.projects add column if not exists first_viewed_at timestamptz;
alter table public.projects add column if not exists last_viewed_at  timestamptz;

create or replace function public.tags_valid(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) <= 10 and not exists (select 1 from unnest(t) x where char_length(x) not between 1 and 30)
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_description_length') then
    alter table public.projects add constraint projects_description_length check (description is null or char_length(description) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_tags_valid') then
    alter table public.projects add constraint projects_tags_valid check (public.tags_valid(tags));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_thumbnail_https') then
    alter table public.projects add constraint projects_thumbnail_https check (thumbnail_url is null or (thumbnail_url ~ '^https?://' and char_length(thumbnail_url) <= 600));
  end if;
end $$;

-- Where the project stands, derived from the row itself so it can never disagree with it.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'status') then
    alter table public.projects add column status text generated always as (
      case
        when archived_at is not null then 'archived'
        when (review ->> 'reviewedAt') is not null then 'reviewed'
        else 'awaiting'
      end
    ) stored;
  end if;
end $$;

create index if not exists projects_status_idx   on public.projects (owner_id, status);
create index if not exists projects_updated_idx  on public.projects (updated_at desc);
create index if not exists projects_tags_idx     on public.projects using gin (tags);

-- Integrity guard, extended: owners cannot write the view counters, and a counter bump is not an "edit".
create or replace function public.projects_guard() returns trigger
language plpgsql as $$
declare
  v_system boolean := coalesce(current_setting('fuddo.system_write', true), '') = '1';
begin
  new.dish_name := left(coalesce(nullif(trim(new.dish ->> 'name'), ''), 'Untitled dish'), 200);

  if tg_op = 'INSERT' then
    if not v_system and not public.is_admin() then
      new.view_count := 0;
      new.first_viewed_at := null;
      new.last_viewed_at := null;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(current_setting('fuddo.skip_touch', true), '') = '1' then
      new.updated_at := old.updated_at;
    else
      new.updated_at := now();
    end if;

    if not v_system and not public.is_admin() then
      -- Owners cannot hand a project to someone else, pick their own review link, or edit view counts.
      new.owner_id := old.owner_id;
      new.share_id := old.share_id;
      new.view_count := old.view_count;
      new.first_viewed_at := old.first_viewed_at;
      new.last_viewed_at := old.last_viewed_at;
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

-- The review link can be switched off without replacing it, and a view is counted (at most once every ten seconds per link).
create or replace function public.get_shared_project(p_share_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'dish', dish, 'spread', spread, 'review', review)
  from public.projects
  where share_id = p_share_id and link_enabled and char_length(p_share_id) between 8 and 64
$$;

create or replace function public.record_link_view(p_share_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_share_id, '')) not between 8 and 64 then return; end if;
  perform set_config('fuddo.system_write', '1', true);
  perform set_config('fuddo.skip_touch', '1', true);
  update public.projects
     set view_count = view_count + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now()
   where share_id = p_share_id and link_enabled
     and (last_viewed_at is null or last_viewed_at < now() - interval '10 seconds');
end $$;

create or replace function public.submit_review(p_share_id text, p_reviewer text, p_picked text, p_comment text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_review  jsonb;
begin
  if char_length(coalesce(p_share_id, '')) not between 8 and 64 then
    raise exception 'This review link is not valid.' using errcode = 'PT404';
  end if;

  select * into v_project from public.projects where share_id = p_share_id and link_enabled for update;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'PT404';
  end if;

  if public.hit_rate_limit('review:' || v_project.id::text, 60, interval '1 hour') then
    raise exception 'This link has received too many answers. Try again later.' using errcode = 'PT429';
  end if;

  if p_picked is not null and not exists (
    select 1 from jsonb_array_elements(v_project.spread) e where e -> 'spec' ->> 'id' = p_picked
  ) then
    raise exception 'That plating is not part of this spread.' using errcode = 'PT400';
  end if;

  v_review := jsonb_build_object(
    'reviewer',     left(coalesce(p_reviewer, ''), 80),
    'pickedSpecId', p_picked,
    'comment',      left(coalesce(p_comment, ''), 2000),
    'reviewedAt',   to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  perform set_config('fuddo.review_write', '1', true);
  update public.projects set review = v_review where id = v_project.id;
  return v_review;
end $$;

revoke all on function public.record_link_view(text) from public;
grant execute on function public.record_link_view(text) to anon, authenticated;
revoke all on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
revoke all on function public.submit_review(text, text, text, text) from public;
grant execute on function public.submit_review(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- settings and the audit trail
-- ---------------------------------------------------------------------------

alter table public.settings add column if not exists description text;
alter table public.settings add column if not exists updated_at  timestamptz not null default now();
alter table public.settings add column if not exists updated_by  uuid references public.profiles (id) on delete set null;
update public.settings set description = 'Whether anyone can create an account, or only an administrator can add people.' where key = 'registration_open' and description is null;

alter table public.admin_events add column if not exists target_id uuid;
alter table public.admin_events add column if not exists details   jsonb not null default '{}'::jsonb;
create index if not exists admin_events_created_idx on public.admin_events (created_at desc);
create index if not exists admin_events_target_idx  on public.admin_events (target_id);

create or replace function public.audit(p_action text, p_target text, p_target_id uuid, p_details jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_events (actor_id, actor_name, action, target, target_id, details)
  select p.id, p.name, left(p_action, 200), left(p_target, 500), p_target_id, coalesce(p_details, '{}'::jsonb)
  from public.profiles p where p.id = auth.uid();
end $$;

create or replace function public.audit(p_action text, p_target text) returns void
language sql security definer set search_path = public as
$$ select public.audit(p_action, p_target, null::uuid, '{}'::jsonb) $$;

create or replace function public.admin_set_registration(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  insert into public.settings (key, value, updated_at, updated_by) values ('registration_open', to_jsonb(p_open), now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public.audit(case when p_open then 'Opened registration' else 'Closed registration' end, 'Workspace', null, jsonb_build_object('registrationOpen', p_open));
end $$;

revoke all on function public.audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.audit(text, text) from public, anon, authenticated;
revoke all on function public.admin_set_registration(boolean) from public, anon;
grant execute on function public.admin_set_registration(boolean) to authenticated;

-- The existing admin functions, now recording what each action was ABOUT (target_id) and its details, so an
-- account's history can be listed (admin_user_detail) and the audit trail can be filtered by subject.
create or replace function public.admin_revoke_sessions(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  perform public.require_admin();
  select email into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  delete from auth.sessions where user_id = p_id;
  perform public.audit('Revoked all sessions', v_email, p_id, '{}'::jsonb);
end $$;

create or replace function public.admin_clear_attempts(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text;
begin
  perform public.require_admin();
  select lower(trim(email)) into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  delete from public.rate_limits where key like 'acct:' || encode(digest(v_email, 'sha256'), 'hex') || ':%';
  perform public.audit('Cleared sign-in attempt limit', v_email, p_id, '{}'::jsonb);
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

  if p_disabled or v_old.role <> p_role or v_old.disabled <> p_disabled or lower(coalesce(v_email, '')) <> lower(coalesce(p_email, '')) then
    delete from auth.sessions where user_id = p_id;
  end if;
  perform public.audit(
    'Updated account', coalesce(p_email, v_email) || ' → ' || p_role || '; ' || case when p_disabled then 'suspended' else 'active' end,
    p_id, jsonb_build_object('role', p_role, 'disabled', p_disabled, 'previousRole', v_old.role, 'wasDisabled', v_old.disabled)
  );
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
  perform public.audit('Updated project', v_old.dish_name || ' → ' || trim(p_name) || '; owner ' || p_owner::text, p_id, jsonb_build_object('previousOwner', v_old.owner_id, 'owner', p_owner));
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
  perform public.audit('Replaced review link', v_old.dish_name, p_id, '{}'::jsonb);
  return v_new;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_revoke_sessions(uuid)', 'admin_clear_attempts(uuid)', 'admin_apply_profile_update(uuid, text, text, text, boolean)', 'admin_update_project(uuid, text, uuid)', 'admin_rotate_share(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- For people: their own projects and numbers
-- ---------------------------------------------------------------------------

-- A light list: no JSON, just what a project card needs.
create or replace function public.my_projects(p_include_archived boolean default false)
returns table (
  id uuid, share_id text, dish_name text, description text, tags text[], status text, thumbnail_url text,
  link_enabled boolean, view_count integer, last_viewed_at timestamptz,
  component_count bigint, plating_count bigint, picked_plating text, reviewer text, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.share_id, p.dish_name, p.description, p.tags, p.status, p.thumbnail_url,
         p.link_enabled, p.view_count, p.last_viewed_at,
         (select count(*) from public.dish_components c where c.project_id = p.id),
         (select count(*) from public.platings pl where pl.project_id = p.id),
         picked.name, r.reviewer, r.reviewed_at, p.created_at, p.updated_at
  from public.projects p
  left join public.reviews r on r.project_id = p.id
  left join public.platings picked on picked.id = r.picked_plating_id
  where p.owner_id = auth.uid() and public.is_active() and (p_include_archived or p.archived_at is null)
  order by p.updated_at desc
$$;

create or replace function public.my_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projects',     count(*),
    'awaiting',     count(*) filter (where status = 'awaiting'),
    'reviewed',     count(*) filter (where status = 'reviewed'),
    'archived',     count(*) filter (where status = 'archived'),
    'linkViews',    coalesce(sum(view_count), 0),
    'platings',     (select count(*) from public.platings pl join public.projects q on q.id = pl.project_id where q.owner_id = auth.uid()),
    'photos',       (select count(*) from public.dish_components c join public.projects q on q.id = c.project_id where q.owner_id = auth.uid() and c.image_url is not null),
    'lastActivity', max(updated_at)
  )
  from public.projects
  where owner_id = auth.uid() and public.is_active()
$$;

-- Start a new project from an existing one: same dish and spread, a fresh review link, no answer yet.
create or replace function public.duplicate_project(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src public.projects;
  v_new uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = 'PT401'; end if;
  if not public.is_active() then raise exception 'This account is suspended.' using errcode = 'PT403'; end if;
  select * into v_src from public.projects where id = p_id and (owner_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Project not found.' using errcode = 'PT404'; end if;

  insert into public.projects (owner_id, dish, spread, description, tags)
  values (
    auth.uid(),
    jsonb_set(v_src.dish, '{name}', to_jsonb(left(coalesce(v_src.dish ->> 'name', 'Untitled dish'), 190) || ' (copy)')),
    v_src.spread, v_src.description, v_src.tags
  )
  returning id into v_new;
  return v_new;
end $$;

-- An owner can replace their own review link (for example after sending it to the wrong person).
create or replace function public.rotate_my_share_link(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_new text := public.new_share_id();
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = 'PT401'; end if;
  perform set_config('fuddo.system_write', '1', true);
  update public.projects set share_id = v_new where id = p_id and owner_id = auth.uid() and public.is_active();
  if not found then raise exception 'Project not found.' using errcode = 'PT404'; end if;
  return v_new;
end $$;

-- Delete my account and everything I own. Photos in Storage are removed through the Storage API, not from here.
create or replace function public.delete_my_account(p_confirm_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = 'PT401'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null or lower(trim(coalesce(p_confirm_email, ''))) <> lower(v_email) then
    raise exception 'Type your email address to confirm.' using errcode = 'PT400';
  end if;
  perform pg_advisory_xact_lock(hashtext('fuddo-admins'));
  if public.is_admin() and (select count(*) from public.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'You are the last administrator. Make someone else an administrator first.' using errcode = 'PT400';
  end if;
  delete from public.projects where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();  -- the profile, sessions and identities go with it
end $$;

-- ---------------------------------------------------------------------------
-- For administrators
-- ---------------------------------------------------------------------------

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'accounts',        (select count(*) from public.profiles),
    'active',          (select count(*) from public.profiles where not disabled),
    'suspended',       (select count(*) from public.profiles where disabled),
    'administrators',  (select count(*) from public.profiles where role = 'admin' and not disabled),
    'signupsLast7d',   (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'projects',        (select count(*) from public.projects),
    'awaiting',        (select count(*) from public.projects where status = 'awaiting'),
    'reviewed',        (select count(*) from public.projects where status = 'reviewed'),
    'archived',        (select count(*) from public.projects where status = 'archived'),
    'ownerless',       (select count(*) from public.projects where owner_id is null),
    'platings',        (select count(*) from public.platings),
    'reviewsLast7d',   (select count(*) from public.reviews where reviewed_at > now() - interval '7 days'),
    'linkViews',       (select coalesce(sum(view_count), 0) from public.projects),
    'cachedImages',    (select count(*) from public.render_cache),
    'imageSpendUsd',   (select coalesce(sum(cost_usd), 0) from public.render_cache),
    'eventsLast24h',   (select count(*) from public.admin_events where created_at > now() - interval '24 hours'),
    'registrationOpen', public.registration_open()
  ) into v;
  return v;
end $$;

create or replace function public.admin_user_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'email', u.email, 'role', p.role, 'disabled', p.disabled,
    'organisation', p.organisation, 'jobTitle', p.job_title, 'locale', p.locale,
    'createdAt', p.created_at, 'lastSignInAt', u.last_sign_in_at,
    'sessions', (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.dish_name, 'status', q.status, 'views', q.view_count, 'updatedAt', q.updated_at) order by q.updated_at desc)
      from public.projects q where q.owner_id = p.id), '[]'::jsonb),
    'recentActions', coalesce((
      select jsonb_agg(jsonb_build_object('action', e.action, 'by', e.actor_name, 'at', e.created_at) order by e.id desc)
      from (select * from public.admin_events where target_id = p.id order by id desc limit 10) e), '[]'::jsonb)
  ) into v
  from public.profiles p join auth.users u on u.id = p.id where p.id = p_id;
  if v is null then raise exception 'Account not found.' using errcode = 'PT404'; end if;
  return v;
end $$;

-- The audit trail, a page at a time (pass the last id you saw as p_before to go further back).
create or replace function public.admin_events_page(p_limit integer default 50, p_before bigint default null)
returns table (id bigint, actor_name text, action text, target text, target_id uuid, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select e.id, e.actor_name, e.action, e.target, e.target_id, e.details, e.created_at
    from public.admin_events e
    where p_before is null or e.id < p_before
    order by e.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_stats()', 'admin_user_detail(uuid)', 'admin_events_page(integer, bigint)',
    'my_projects(boolean)', 'my_stats()', 'duplicate_project(uuid)', 'rotate_my_share_link(uuid)', 'delete_my_account(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Maintenance (service role only). Schedule it daily if pg_cron is enabled:
--   select cron.schedule('fuddo-purge', '17 3 * * *', 'select public.purge_expired()');
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limits integer;
  v_allow  integer;
begin
  delete from public.rate_limits where expires_at < now() - interval '1 day';
  get diagnostics v_limits = row_count;
  delete from public.registration_allow where expires_at < now();
  get diagnostics v_allow = row_count;
  return jsonb_build_object('rateLimits', v_limits, 'registrationApprovals', v_allow);
end $$;

revoke all on function public.purge_expired() from public, anon, authenticated;
