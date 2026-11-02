-- FUDDO AI: relational tables for dishes, platings and reviews.
--
-- Until now a project kept its dish, its spread of platings and the consultant's review as JSON on one row.
-- That is simple to write and is still the single place the app writes. This migration adds real tables
-- (with foreign keys, indexes and Row Level Security) that mirror that JSON, so the data can be queried,
-- joined, counted and reported on with plain SQL.
--
--   projects.dish    ──▶  dish_components   one row per component of the dish
--   projects.spread  ──▶  platings          one row per plating direction offered to the consultant
--   projects.review  ──▶  reviews           the consultant's answer (one per project, for now)
--
-- The new tables are READ-ONLY projections. A trigger rebuilds them inside the same transaction as every
-- write to `projects`, so they cannot drift and there is still exactly one write path. Nothing in the
-- application had to change. Idempotent: safe to run more than once. Existing rows are backfilled at the end.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.dish_components (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  component_key text not null,                        -- the id the studio gave the component ("c1", "c-m3x…")
  name          text not null,
  role          text check (role in ('hero', 'support', 'sauce', 'garnish')),
  image_url     text,                                 -- the chef's photo of this component, if any
  position      integer not null,                     -- stack order, bottom first
  unique (project_id, component_key)
);
create index if not exists dish_components_project_idx on public.dish_components (project_id);
create index if not exists dish_components_role_idx    on public.dish_components (role);

create table if not exists public.platings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  spec_id     text not null,                          -- the spec's own id ("spec-1"); what a review refers to
  name        text not null default '',               -- "Classic centred", "Tall stack"…
  position    integer not null,
  composition text check (composition in ('centered', 'stacked-tall', 'off-center', 'linear', 'scattered', 'negative-space')),
  plate       text check (plate in ('round-white', 'black-slate', 'square-white', 'deep-bowl', 'wooden-board', 'coupe-grey')),
  sauce       text check (sauce in ('pooled', 'dotted', 'drizzled', 'smeared', 'aside', 'none')),
  height      text check (height in ('flat', 'low', 'medium', 'tall')),
  garnish     text check (garnish in ('minimal', 'moderate', 'generous')),
  notes       text not null default '',               -- the chef's direction
  seed        bigint,
  overrides   jsonb not null default '{}'::jsonb,     -- drag offsets, keyed by element
  tweaks      jsonb not null default '{}'::jsonb,     -- per-element height/size/colour/rotation/shape/hidden
  copies      jsonb not null default '{}'::jsonb,     -- extra instances of a component
  unique (project_id, spec_id)
);
create index if not exists platings_project_idx     on public.platings (project_id);
create index if not exists platings_direction_idx   on public.platings (composition, plate, sauce);

-- One answer per project for now. Dropping the unique constraint is all it takes to allow several.
create table if not exists public.reviews (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references public.projects (id) on delete cascade,
  reviewer          text not null default '',
  picked_spec_id    text,
  picked_plating_id uuid references public.platings (id) on delete set null,
  comment           text not null default '',
  reviewed_at       timestamptz not null
);
create index if not exists reviews_picked_idx   on public.reviews (picked_plating_id);
create index if not exists reviews_reviewed_idx on public.reviews (reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Keeping them in step with projects
-- ---------------------------------------------------------------------------

-- JSON in `projects` is written by owners straight to Postgres, so it may be malformed. These casts never
-- raise: anything that does not parse becomes NULL, and the offending piece is simply not projected.
create or replace function public.safe_timestamptz(p text) returns timestamptz
language plpgsql immutable as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.safe_bigint(p text) returns bigint
language plpgsql immutable as $$
begin
  if p ~ '^[0-9]{1,15}$' then return p::bigint; end if;
  return null;
end $$;

create or replace function public.sync_project_tables(p public.projects) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_components jsonb := case when jsonb_typeof(p.dish -> 'components') = 'array' then p.dish -> 'components' else '[]'::jsonb end;
  v_spread     jsonb := case when jsonb_typeof(p.spread) = 'array' then p.spread else '[]'::jsonb end;
  v_reviewed   timestamptz := public.safe_timestamptz(nullif(p.review ->> 'reviewedAt', ''));
begin
  -- Components ------------------------------------------------------------
  with src as (
    select distinct on (e.value ->> 'id')
      e.value as c, (e.ord - 1)::integer as pos
    from jsonb_array_elements(v_components) with ordinality as e(value, ord)
    where jsonb_typeof(e.value) = 'object' and nullif(e.value ->> 'id', '') is not null
    order by e.value ->> 'id', e.ord
  ), gone as (
    delete from public.dish_components d
    where d.project_id = p.id and d.component_key not in (select c ->> 'id' from src)
    returning 1
  )
  insert into public.dish_components (project_id, component_key, name, role, image_url, position)
  select p.id, c ->> 'id', left(coalesce(c ->> 'name', ''), 200),
         case when c ->> 'role' in ('hero', 'support', 'sauce', 'garnish') then c ->> 'role' end,
         nullif(c ->> 'imagePath', ''), pos
  from src
  on conflict (project_id, component_key) do update
    set name = excluded.name, role = excluded.role, image_url = excluded.image_url, position = excluded.position;

  -- Platings --------------------------------------------------------------
  with src as (
    select distinct on (e.value -> 'spec' ->> 'id')
      e.value as entry, e.value -> 'spec' as spec, (e.ord - 1)::integer as pos
    from jsonb_array_elements(v_spread) with ordinality as e(value, ord)
    where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'spec') = 'object'
      and nullif(e.value -> 'spec' ->> 'id', '') is not null
    order by e.value -> 'spec' ->> 'id', e.ord
  ), gone as (
    delete from public.platings g
    where g.project_id = p.id and g.spec_id not in (select spec ->> 'id' from src)
    returning 1
  )
  insert into public.platings (project_id, spec_id, name, position, composition, plate, sauce, height, garnish, notes, seed, overrides, tweaks, copies)
  select p.id, spec ->> 'id', left(coalesce(entry ->> 'name', ''), 200), pos,
         case when spec ->> 'composition' in ('centered', 'stacked-tall', 'off-center', 'linear', 'scattered', 'negative-space') then spec ->> 'composition' end,
         case when spec ->> 'plate' in ('round-white', 'black-slate', 'square-white', 'deep-bowl', 'wooden-board', 'coupe-grey') then spec ->> 'plate' end,
         case when spec ->> 'sauce' in ('pooled', 'dotted', 'drizzled', 'smeared', 'aside', 'none') then spec ->> 'sauce' end,
         case when spec ->> 'height' in ('flat', 'low', 'medium', 'tall') then spec ->> 'height' end,
         case when spec ->> 'garnish' in ('minimal', 'moderate', 'generous') then spec ->> 'garnish' end,
         left(coalesce(spec ->> 'notes', ''), 2000),
         public.safe_bigint(spec ->> 'seed'),
         case when jsonb_typeof(spec -> 'overrides') = 'object' then spec -> 'overrides' else '{}'::jsonb end,
         case when jsonb_typeof(spec -> 'tweaks') = 'object' then spec -> 'tweaks' else '{}'::jsonb end,
         case when jsonb_typeof(spec -> 'copies') = 'object' then spec -> 'copies' else '{}'::jsonb end
  from src
  on conflict (project_id, spec_id) do update
    set name = excluded.name, position = excluded.position, composition = excluded.composition, plate = excluded.plate,
        sauce = excluded.sauce, height = excluded.height, garnish = excluded.garnish, notes = excluded.notes,
        seed = excluded.seed, overrides = excluded.overrides, tweaks = excluded.tweaks, copies = excluded.copies;

  -- Review: a row exists exactly while the project has an answer --------------
  if v_reviewed is null then
    delete from public.reviews where project_id = p.id;
  else
    insert into public.reviews (project_id, reviewer, picked_spec_id, picked_plating_id, comment, reviewed_at)
    values (
      p.id,
      left(coalesce(p.review ->> 'reviewer', ''), 80),
      nullif(p.review ->> 'pickedSpecId', ''),
      (select pl.id from public.platings pl where pl.project_id = p.id and pl.spec_id = p.review ->> 'pickedSpecId'),
      left(coalesce(p.review ->> 'comment', ''), 2000),
      v_reviewed
    )
    on conflict (project_id) do update
      set reviewer = excluded.reviewer, picked_spec_id = excluded.picked_spec_id,
          picked_plating_id = excluded.picked_plating_id, comment = excluded.comment, reviewed_at = excluded.reviewed_at;
  end if;
end $$;

create or replace function public.projects_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_project_tables(new);
  return null;
end $$;

drop trigger if exists fuddo_projects_sync on public.projects;
create trigger fuddo_projects_sync after insert or update of dish, spread, review on public.projects
  for each row execute function public.projects_sync();

-- Only the trigger may run these.
revoke all on function public.sync_project_tables(public.projects) from public, anon, authenticated;
revoke all on function public.projects_sync() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: read what you can already read in `projects`; write nothing directly
-- ---------------------------------------------------------------------------

alter table public.dish_components enable row level security;
alter table public.platings        enable row level security;
alter table public.reviews         enable row level security;

-- The sub-select runs under the caller's own policies, so "can see the project" is the whole rule.
drop policy if exists dish_components_select on public.dish_components;
create policy dish_components_select on public.dish_components for select to authenticated
  using (exists (select 1 from public.projects pr where pr.id = project_id));

drop policy if exists platings_select on public.platings;
create policy platings_select on public.platings for select to authenticated
  using (exists (select 1 from public.projects pr where pr.id = project_id));

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated
  using (exists (select 1 from public.projects pr where pr.id = project_id));

revoke all on public.dish_components, public.platings, public.reviews from anon;
revoke insert, update, delete, truncate on public.dish_components, public.platings, public.reviews from authenticated;

-- ---------------------------------------------------------------------------
-- Reporting views. They run as the caller (security_invoker), so an owner sees their own numbers and an
-- administrator sees everyone's.
-- ---------------------------------------------------------------------------

create or replace view public.project_overview with (security_invoker = true) as
select
  p.id, p.owner_id, o.name as owner_name, p.dish_name, p.share_id, p.created_at, p.updated_at,
  (select count(*) from public.dish_components c where c.project_id = p.id) as component_count,
  (select count(*) from public.dish_components c where c.project_id = p.id and c.image_url is not null) as photo_count,
  (select count(*) from public.platings pl where pl.project_id = p.id) as plating_count,
  r.reviewed_at, r.reviewer, r.comment as review_comment, picked.name as picked_plating
from public.projects p
left join public.profiles o on o.id = p.owner_id
left join public.reviews r on r.project_id = p.id
left join public.platings picked on picked.id = r.picked_plating_id;

-- Which directions get offered, and which get chosen.
create or replace view public.direction_popularity with (security_invoker = true) as
select
  pl.composition, pl.plate, pl.sauce,
  count(*)                          as times_offered,
  count(r.id)                       as times_picked,
  round(100.0 * count(r.id) / nullif(count(*), 0), 1) as pick_rate_pct
from public.platings pl
left join public.reviews r on r.picked_plating_id = pl.id
group by pl.composition, pl.plate, pl.sauce;

revoke all on public.project_overview, public.direction_popularity from anon;
grant select on public.project_overview, public.direction_popularity to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: project everything that already exists
-- ---------------------------------------------------------------------------

do $$
declare r public.projects;
begin
  for r in select * from public.projects loop
    perform public.sync_project_tables(r);
  end loop;
end $$;
