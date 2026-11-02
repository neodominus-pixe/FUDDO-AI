# Architecture

## The shape of it

```
Browser ──▶ proxy.ts ──▶ pages (Server Components)  ─┐
   │        refresh session,                          ├─▶ lib/backend  ──▶ Supabase
   │        guard signed-in routes                    │     (one contract,     Auth · Postgres (RLS) · Storage
   └──────▶ app/api/* route handlers  ────────────────┘      one implementation)
                     │
                     └─▶ lib/engine, lib/render, lib/providers   (pure layout + geometry, image providers)
```

**Pages and API routes are thin.** A route validates input with Zod, checks who is calling (`lib/auth.ts → guard`), calls one method on `backend`, and shapes the response. They contain no SQL and no Supabase calls.

**`lib/backend/types.ts` is the contract.** Everything the app needs from a data store: accounts, projects, the public review, images, administration, rate limiting. `lib/backend/supabase.ts` implements it; `setBackend()` lets tests substitute a fake. Swapping the store means writing one file.

**The database is the authority.** Row Level Security decides who sees which row. Triggers and functions enforce the rules that must hold whatever code path reaches Postgres (see [SECURITY.md](SECURITY.md)). The application checks are a fast path and a friendly error message, not the last line of defence.

## Data model (`supabase/migrations/…_fuddo_init.sql`)

| Table | Purpose | Who can touch it |
|---|---|---|
| `profiles` | one row per account: name, role (`user`/`admin`), suspended flag | own row readable, name writable; admins read all; role/status only via admin functions |
| `projects` | a dish, its spread of platings, the consultant's review, the share link | owner (or admin) via RLS; a consultant reaches one row only through `get_shared_project` / `submit_review` |
| `settings` | `registration_open` | readable by all, writable only through `admin_set_registration` |
| `render_cache` | paid images already generated, keyed by a content hash | service role only |
| `admin_events` | audit trail | admins read; written only by admin functions |
| `rate_limits` | fixed-window counters | service role only |
| `role_invites` | a role pre-assigned to an email; applied (and removed) when that account exists with a confirmed email | you only (Table Editor / SQL / service role) |
| `registration_allow` | one-shot approvals so an admin can add someone while sign-up is closed | service role only |
| `dish_components`, `platings`, `reviews` | relational mirror of the dish, the spread and the consultant's answer, rebuilt by a trigger inside the same transaction as every write to `projects` (one write path, no drift); foreign keys and indexes for querying | read-only; visible to whoever can see the project |
| `project_overview`, `direction_popularity` (views) | per-project summary; which directions get offered and picked | run as the caller, so owners see their own numbers and admins see everyone's |
| `storage.objects` (`media` bucket) | component photos (`<uid>/…`) and generated images (`generated/…`) | users write only inside their own folder; `generated/` is server-only |

Sign-up creates a `profiles` row through a trigger on `auth.users`. The role is never read from client-controlled metadata.

## The plating engine (`lib/engine`, pure TypeScript)

Deterministic and dependency-free, so the browser, the server and the tests all get identical results.

- **`spec.ts`** — twelve named plating directions (Classic centred, Tall stack, Negative space…). The spec is the source of truth: every render is produced from it, never from a previous image, which is what stops edits from drifting.
- **`engine/layout`** — turns a dish and a spec into positions on the plate (`anchors`, `sauce`, `separation` to keep pieces apart and on the plate, `plates`, `elevations`). Seeded RNG, so a spec always lays out the same way. Chef edits are `overrides` (drag offsets), `tweaks` (height, size, colour, rotation, shape, hidden) and `copies`, applied on top of the preset.
- **`engine/gltf`** — the 3D shape library and binary glTF 2.0 writer: about thirty shape families (nests of pasta, quenelles, wedges, stacks…) with baked contact shadow, browning and mottle.
- **`model3d.ts`** — assembles a full plate model from layout + shapes. Used for the editor, the review viewer, the spec card and the landing-page hero.
- **`providers/`** — an image provider returns an SVG (mock) or raster bytes (OpenAI). `render.ts` stores the bytes and caches by content hash, so a provider never needs to know where images live.

A golden test (`tests/unit/golden.test.ts`) fingerprints the glTF output of 139 fixed inputs — every shape family, every direction, every plate and sauce — so a refactor that changes a single vertex fails loudly.

## The live 3D scene (`lib/scene`, `components/ModelViewer.tsx`, `components/studio`)

The server builds a glTF once for what is IN a plating; the browser then owns where things stand.

- **`scene/poses.ts`** replicates the layout and elevation pipeline in the browser (they are pure functions) and returns a pose for every element. `modelKey()` is the fingerprint of everything that changes what is in the model (plate, composition, garnish, copies, shape variants, hidden pieces, the drizzle's curve). While it is unchanged, **moving, turning, resizing, recolouring and lifting a piece never rebuild the model**: `ModelViewer` eases the existing nodes to the new poses. A drag previews exactly the spec the drop will write, so nothing jumps on release.
- **Surface-aware placement.** A piece dropped on another rests on its highest point; the extra height is saved as `overrides[key].e` and applied by `elevations()`. Dragging respects the rim (`clampToPlate`) and snaps to centre lines, rings and other pieces' rows (`scene/snap.ts`; hold Alt to bypass).
- **Studio tools.** Outliner (select, hide, lock, solo), exact position in centimetres, multi-select with group drag, align / distribute / mirror / repeat (`scene/arrange.ts`, pure and unit-tested), saved camera views, lighting presets, guides. Every command is an ordinary spec change, so it is one undo step and it is saved, shared and rebuilt like any other edit.
- **Set** (`components/scene/set.ts`, `components/studio/SceneBar.tsx`): the photographed scene. `spec.scene` (`{ table, props, light, focus }`, all optional; a value left at its default is not stored) selects a painted, tileable table surface, cutlery and a napkin built from primitives, a lighting preset and a depth-of-field pass. The studio environment map is a dark room holding a few emissive panels, so glaze and sauce get highlights with a shape. Changing any of it re-dresses the live scene without rebuilding the model.
- **Look** (`components/scene/look.ts`): physical materials (clear coat on sauce and ceramic), shader-based micro-detail (the food has no UVs), ambient occlusion, and lighting presets. A piece with a photo gets relief and roughness from it (the photo's detail above its own blurred version, sampled with a mip bias) and a translucency term (`RELIEF` and `GLOW` tables per surface kind: leaf, food, sauce) that adds light passing through the piece from the key light behind it.
- **Textures.** `ingredient_textures` is a shared library keyed by normalised ingredient name. `lib/textures/service.ts` claims the work for exactly one maker (`claim_ingredient_texture`), checks the shared allowance, asks the provider (`gemini.ts`, or `mock.ts` locally), stores the image in the public `media` bucket and marks the row ready. The viewer projects a texture onto each shape in the shader: seen from above it is laid over the top, and a strip of it wraps the sides. Review links read the library but can never add to it.
- **Sauce brush** (`lib/engine/layout/brush.ts`, `components/studio/Brush*.tsx`). A chef paints sauce by dragging across the plate, in the 3D view or the 2D top-down view. The stroke is simplified to at most 64 points and stored in `spec.brush` (up to 8 strokes, each `{ w, pts }` in the same 0..1 frame as `overrides`). It is sauce *in addition to* the sauce style, so it works on a pooled plate, a drizzled one, or a dish with no sauce component. `sauceLayout` resamples each stroke evenly and returns it as a `SauceStroke` with its centre line, a tapered ribbon outline for the 2D picture, and the samples the 3D model sweeps into one tube that thins at both ends. Each stroke is an object of its own, keyed `stroke:<index>` (`lib/scene/strokes.ts`): it is selected, locked, shown alone, listed in the outliner and carried by itself, in 3D by dragging, arrow keys or the position fields, and in 2D by its dashed handle. Carrying one translates its points in `spec.brush` (kept inside the picture) rather than writing an override, and it does not follow the sauce's own move, size or turn; it does take the sauce's colour. It also shows in the prompt a paid image model receives. Adding, removing or reshaping a stroke rebuilds the model; carrying one inside the plate is a live move.
- **Spread cards are pictures of the 3D scene** (`components/studio/SpreadSnapshots.tsx`). One hidden viewer builds each plating locally with the same engine the server uses (no round trip), waits for its photographic surfaces, takes a picture, and moves to the next, so the grid in the studio and on the review link fills in card by card. A card is redrawn when its plating changes (the key is the plating's JSON). The flat drawing is only a fallback for a browser that cannot draw 3D; a real photograph from a paid provider still takes priority. The review API sends component ids so the page draws each plating exactly as the chef left it.
- **Polish** (`lib/polish.ts`, `POST /api/polish`): the editor's frame is sent to the image model with an instruction that changes the finish and nothing else.

## Request flows

**Generate a spread** `POST /api/generate` → `guard` (same-origin, signed in) → validate dish → 12 specs → `renderOne` ×12 (four at a time) → for the mock provider, SVGs; for a paid one, cache lookup → quota check → provider → Storage → `render_cache`.

**Share and review** chef saves (`POST /api/projects`) → a `share_id` is generated in Postgres → consultant opens `/review/<id>` → `get_shared_project` (anonymous RPC, returns only dish/spread/review) → renders from stored data only → `submit_review` (anonymous RPC, validates the pick, caps the fields, throttles per link) → the chef's studio polls and sees the answer.

**Sign in** `POST /api/auth/signin` → throttle check (failed attempts only) → Supabase Auth → profile check (suspended accounts are refused) → HttpOnly cookies → `proxy.ts` refreshes them on later navigations.

## Conventions

- Routes are wrapped in `route()` so any throw becomes structured JSON; server detail goes to the log, never the client.
- Anything a browser can send is parsed with a Zod schema with explicit bounds (lengths, ranges, hex colours, http(s) photo URLs).
- Pages that depend on the signed-in user are `dynamic = 'force-dynamic'`: a build never needs the database.
- `server-only` guards every module that holds secrets, so it cannot end up in a client bundle.
- Files are LF; `.editorconfig` and `.gitattributes` keep them that way.
