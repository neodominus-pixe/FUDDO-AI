-- FUDDO AI: the ingredient texture library.
--
-- Every ingredient the studio has ever plated can have one photographic surface texture: a top-down macro photo
-- of that food, wrapped onto its 3D shape. A texture is made once (by an image model, or uploaded) and then
-- shared by everyone, so a popular ingredient costs nothing after the first time and the free image quota
-- stretches a long way.
--
--   ingredient_textures       one row per normalised ingredient name; the image lives in the public `media`
--                             bucket under ingredients/<key>.<ext>
--   claim_ingredient_texture  hands generation of a missing texture to exactly one caller at a time, so two chefs
--                             plating "duck breast" together do not both spend a request on it
--
-- Anyone may READ a finished texture (a review link has no account, and these are generic pictures of food).
-- Only the server, with the service role, may create or change one. Idempotent: safe to run more than once.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'texture_status' and n.nspname = 'public') then
    create type public.texture_status as enum ('pending', 'ready', 'failed');
  end if;
end $$;

create table if not exists public.ingredient_textures (
  key          text primary key check (key = lower(key) and key = btrim(key) and char_length(key) between 1 and 80),
  name         text not null check (char_length(name) between 1 and 120),
  status       public.texture_status not null default 'pending',
  path         text,
  mime         text check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  avg_color    text check (avg_color ~ '^#[0-9a-f]{6}$'),
  source       text not null default 'generated' check (source in ('generated', 'uploaded')),
  model        text,
  prompt       text,
  attempts     integer not null default 0,
  error        text,
  requested_by uuid references auth.users (id) on delete set null,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status <> 'ready' or path is not null)
);
comment on table public.ingredient_textures is 'One surface texture per normalised ingredient name, shared by every chef and every review link.';

create index if not exists ingredient_textures_status_idx on public.ingredient_textures (status, updated_at);

alter table public.ingredient_textures enable row level security;
revoke all on public.ingredient_textures from anon, authenticated;
grant select on public.ingredient_textures to anon, authenticated;

drop policy if exists ingredient_textures_read_ready on public.ingredient_textures;
create policy ingredient_textures_read_ready on public.ingredient_textures for select to anon, authenticated
  using (status = 'ready');

drop policy if exists ingredient_textures_read_admin on public.ingredient_textures;
create policy ingredient_textures_read_admin on public.ingredient_textures for select to authenticated
  using (public.is_admin());

create or replace function public.ingredient_textures_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists fuddo_ingredient_textures_touch on public.ingredient_textures;
create trigger fuddo_ingredient_textures_touch before update on public.ingredient_textures
  for each row execute function public.ingredient_textures_touch();

-- Returns true when the caller now owns generating this texture. A row that is already ready, or being made
-- right now, is not claimed. A failed row is retried after ten minutes, and a claim that never finished (the
-- server restarted mid-request) is given up after three, so nothing stays stuck.
create or replace function public.claim_ingredient_texture(p_key text, p_name text, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed integer;
begin
  insert into public.ingredient_textures (key, name, status, attempts, requested_by, claimed_at)
  values (p_key, left(p_name, 120), 'pending', 1, p_user, now())
  on conflict (key) do update
    set status = 'pending',
        attempts = public.ingredient_textures.attempts + 1,
        requested_by = coalesce(p_user, public.ingredient_textures.requested_by),
        claimed_at = now(),
        error = null
    where (public.ingredient_textures.status = 'failed' and public.ingredient_textures.updated_at < now() - interval '10 minutes')
       or (public.ingredient_textures.status = 'pending' and public.ingredient_textures.claimed_at < now() - interval '3 minutes');
  get diagnostics v_claimed = row_count;
  return v_claimed > 0;
end $$;

revoke all on function public.claim_ingredient_texture(text, text, uuid) from public, anon, authenticated;
