-- A seventh plate: the shallow bowl (a wide, low-walled pasta or risotto bowl; the one between the flat plate and the
-- deep bowl). The studio saves a plating's plate by name, and the database only accepted the six existing names:
--   1. the CHECK on platings.plate, which would reject the row, and
--   2. sync_project_tables(), which projects the saved JSON into platings and turns any name it does not know into
--      NULL, so a plating saved on the new plate would have come back with no plate at all.
-- Both are widened here. Safe to run again: the constraint is dropped and re-added, the function is replaced, and the
-- re-projection at the end only touches projects that already mention the new plate.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.platings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%plate%'
  loop
    execute format('alter table public.platings drop constraint %I', c.conname);
  end loop;
  alter table public.platings
    add constraint platings_plate_check
    check (plate in ('round-white', 'black-slate', 'square-white', 'deep-bowl', 'wooden-board', 'coupe-grey', 'shallow-bowl'));
end $$;

-- Same function as in 20261001000000_normalized_tables.sql, with the new plate name on its list.
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
         case when spec ->> 'plate' in ('round-white', 'black-slate', 'square-white', 'deep-bowl', 'wooden-board', 'coupe-grey', 'shallow-bowl') then spec ->> 'plate' end,
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

revoke all on function public.sync_project_tables(public.projects) from public, anon, authenticated;

-- A project saved with the new plate before this ran had it projected as NULL; project it again.
do $$
declare r public.projects;
begin
  for r in select * from public.projects where spread::text like '%shallow-bowl%' loop
    perform public.sync_project_tables(r);
  end loop;
end $$;
