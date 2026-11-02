# FUDDO AI — Plating Studio

A chef lists what they cooked, photographs each component, and gets a spread of twelve named plating directions in seconds. They refine one by dragging and tweaking it (in 2D or in a live 3D viewer), send a link to a consultant, and get one decision back — without cooking twelve plates to get there. The consultant needs no account: the link is the credential.

Built on Next.js 16, React 19, Three.js and **Supabase** (Auth, Postgres with Row Level Security, Storage).

```
Chef ── signs in ──▶ /studio ── lists components + photos ──▶ 12 plating directions
                        │                                            │
                        │  drag · resize · recolour · 2D / 3D        ▼
                        └────────────── refine one ───────▶ share link ──▶ Consultant (no account)
                                                                              │ turn the plate in 3D,
                        spec card (print / glTF) ◀─────── their pick ◀────────┘ compare, pick, comment
Admin ── /admin ──▶ accounts, roles, suspension, sessions, projects, audit log, open/closed sign-up
```

## Setup

Requires **Node.js 24+** and either **Docker** (for a local Supabase, the easiest way to start) or a hosted Supabase project.

### 1. Local (Docker)

```sh
npm install
npm run db:start          # local Supabase on ports 55321–55324 (project "fuddo-ai"); applies supabase/migrations
```

`db:start` prints the local URL and keys. Copy `.env.example` to `.env.local` and paste them in (the local demo keys are public and only work on your machine):

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # "anon key" / publishable key
SUPABASE_SERVICE_ROLE_KEY=...            # "service_role key" / secret key
```

```sh
npm run dev               # http://localhost:3000
```

Create an account at `/auth`, then make yourself an administrator:

```sh
npm run admin:grant -- you@example.com
```

Password-reset emails from the local stack land in the mail catcher at <http://127.0.0.1:55324>. `npm run db:stop` stops the stack, `npm run db:reset` rebuilds the database from the migration.

### 2. Hosted Supabase

1. Create a project. Under **SQL editor**, run the six files in `supabase/migrations/` **in order** (or `npx supabase link` then `npx supabase db push`, which does that for you). Each is idempotent and safe to re-run:
   1. `20260930000000_fuddo_init.sql`: core tables, access rules, functions, storage
   2. `20261001000000_normalized_tables.sql`: relational `dish_components`, `platings`, `reviews` and two reporting views
   3. `20261001000100_columns_and_functions.sql`: extra columns (profile details, project status/tags/archive/link switch/view counts) and functions (my projects, stats, duplicate, rotate link, delete account, admin stats and user detail)
   4. `20261001000200_roles.sql`: roles as a dropdown list (`user_role`) and `role_invites`
   5. `20261002000000_ingredient_textures.sql`: the shared ingredient texture library (`ingredient_textures`) and its claim function
   6. `20261012000000_shallow_bowl.sql`: lets the shallow bowl be saved as a plating's plate (widens the `platings.plate` check and the project-to-tables sync)
2. **Project Settings → API**: copy the URL, the anon key, and the service-role key into your host's environment variables (`.env.example` lists all of them). The service-role key is server-only; never prefix it with `NEXT_PUBLIC_`.
3. **Authentication → URL Configuration**: set *Site URL* to your production URL and add `https://your-domain/**` to *Redirect URLs* (password-reset links need it).
4. **Authentication → Sign in / Providers → Email**: set *Minimum password length* to 12 (the app enforces 12–128 too). Decide whether to require email confirmation; the sign-up form handles both.
5. **Authentication → Rate limits** and **Attack protection**: the defaults are sensible; enable *Prevent use of leaked passwords* if your plan has it. For reset emails to reach real inboxes configure a custom SMTP provider (Supabase's built-in sender is for testing only).
6. Deploy (Vercel or any Node host). Set `TRUST_PROXY=1` only behind a proxy you control that overwrites `X-Forwarded-For` (it is automatic on Vercel).
7. Sign up, then run `npm run admin:grant -- you@example.com` with the service-role key in your environment.

### Image and 3D providers

`IMAGE_PROVIDER=mock` (default) draws platings locally with the layout engine: free, instant, deterministic. `IMAGE_PROVIDER=gpt-image` with `OPENAI_API_KEY` renders real photographs, conditioned on the chef's component photos.

Paid providers are guarded on purpose:

- A picture is **paid for once**. It is stored in Supabase Storage and cached by a hash of everything that shaped it, so reopening a project, viewing a spec card, or a consultant loading the review link never triggers another generation.
- **A public review link can never spend money.** It only shows what already exists and otherwise falls back to the free local drawing.
- Each chef has an hourly allowance (`GENERATION_LIMIT_PER_HOUR`, default 120 images), counted at the moment a paid image is about to be generated.
- `MODEL_PROVIDER=mock-3d` builds the 3D model locally from the layout engine. Meshy/Tripo/Rodin are priced in `lib/pricing.ts` but not wired.

### Scene

Above the viewer, choose the table (oak, marble, linen, slate, concrete), props beside the plate (cutlery, napkin), the lighting (studio, bistro, daylight, moody) and **Soft focus**. The choice is saved with the plating, so the spread cards, the 2D view and the consultant's review show it too.

### Sauce brush

In the refine view, turn on **Sauce brush**, pick Fine, Medium or Broad, and drag across the plate (3D view, or the 2D view while it is looking straight down). Each stroke is a tapered ribbon of sauce, up to eight per plating; remove one with its × chip or Undo. Hold **Alt** and drag to turn the 3D view while the brush is on. Strokes are extra sauce on top of whichever sauce style is chosen, and each is its own object: click its chip (or its row in the outliner, or the stroke itself in 3D), then drag it, nudge it with the arrow keys, type its position, lock it, show it alone, or delete it with the Delete key. In the 2D top-down view each stroke has a dashed handle to drag. Strokes take the sauce's colour.

### Photographic textures and polished renders (Gemini)

The 3D editor can wrap a photograph of each ingredient onto its shape, and turn the current view into a photograph of the same arrangement (**✦ Polish**). Both use Google's Gemini image model.

1. Create a key at <https://aistudio.google.com/apikey> and put it in `.env` as `GEMINI_API_KEY` (never in the browser, never in chat). Without a key everything still works: textures use a free local stand-in and Polish returns the 3D view as it is, saying so.
2. `GEMINI_IMAGE_MODEL` defaults to `gemini-2.5-flash-image`. If your key says the model is not available, set it to an image-capable model your key can use.
3. A **free key has small per-minute and per-day limits**, so the app spends them carefully: a texture is made once per ingredient and shared by every chef and every review link; makers share a per-minute allowance (`TEXTURES_PER_MINUTE`, default 6) and each chef an hourly one (`TEXTURES_PER_USER_HOUR`, `POLISH_PER_HOUR`). When the allowance runs out, plain colours stay until it resets.
4. Fill the library ahead of time, slowly and safely resumable: `npm run textures:seed -- --limit 25` (add `--dry-run` to preview). Administrators can review, remake and delete textures under **Admin → Textures**. After the colour table or the painters change, `npm run textures:refresh` repaints the locally painted textures already in the library (`--dry-run` to preview, `--force` to repaint all, `--only "fish fillet"` for one); textures made by an image service are left alone.

The key is only ever read on the server. Review links cannot make textures or polished renders; they only show what exists.

## Commands

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests: layout, plating directions, glTF validity, schemas, limiter, cookies (176 tests, no services needed) |
| `npm run test:db` | 79 integration tests against the local Docker Supabase: RLS, triggers, relational tables, admin and user functions, storage, importer. Reads `.env.docker` (the local demo keys; `db:start` prints them) so it can never touch your hosted project |
| `npm run test:e2e` | 25 end-to-end tests over HTTP with cookies, also using `.env.docker`; start the app with those same variables: auth, throttling, projects, review, uploads, admin, recovery (needs `db:start` and the app running on `E2E_BASE_URL`, default `http://localhost:3111`) |
| `npm run typecheck` / `lint` | TypeScript / ESLint (both clean) |
| `npm run golden:update` | Re-record the 3D engine's golden fingerprints after an *intentional* geometry change |
| `npm run admin:grant -- email` | Make an account an administrator |
| `npm run import:legacy -- --db studio.sqlite` | Import data from the original SQLite version (see below) |

## Accounts and sessions

Sign-in, sessions and passwords are Supabase Auth's. The app adds:

- **Password policy** 12–128 characters, stated when choosing a password, never when signing in.
- **HttpOnly, SameSite=Lax session cookies** (`Secure` in production). "Remember me" keeps them 30 days; otherwise they end with the browser session. Signing out revokes the session server-side, so a copied cookie is dead.
- **Throttling that cannot be used to lock someone out.** Only *failed* sign-ins count, keyed on (address, account) and on address alone. A stranger guessing your email locks out their own connection, never you.
- **Password recovery.** "Forgot password?" emails a one-hour, single-use link. The answer never reveals whether an address has an account, requests are throttled per address and per mailbox, and choosing a new password signs out every other device.
- **Closed registration is enforced in the database**, so it cannot be bypassed by calling the Auth API directly with the public key.
- **Roles.** Everyone starts as a regular user. Administrators are made with `npm run admin:grant` or in `/admin`; there is no way to self-promote.

## Roles

There are two roles today, `user` and `admin`. Everyone starts as `user`; nobody can promote themselves. Choose a role from Supabase in any of these ways:

- **Table Editor ▸ `profiles` ▸ the `role` cell**: it is a dropdown (a Postgres enum, `user_role`), so a typo is impossible.
- **Before the person exists: Table Editor ▸ `role_invites`**: add their email and a role. The account gets that role as soon as it exists and its email is confirmed, then the invite is used up. (Confirmed only, so nobody can claim an invited address by signing up with it first.) No invite means `user`.
- **SQL:** `update public.profiles set role = 'admin' where email = 'someone@example.com';`
- **The app's `/admin` panel:** Accounts ▸ Manage ▸ Role.

**Adding `chef` and `consultant` later** is a one-line migration per role plus one line in `lib/roles.ts`:

```sql
alter type public.user_role add value if not exists 'chef';
alter type public.user_role add value if not exists 'consultant';
```

Run that as its own migration, then add the names to `ROLES` in `lib/roles.ts`. The dropdown, the admin panel's picker and the validation all follow. What each role may *do* is a separate decision: write its Row Level Security policies (only `admin` has special powers today).

## Administration

`/admin` lets an administrator search accounts, add people (also while sign-up is closed), edit names/emails/roles, suspend and reactivate, change passwords, revoke all sessions, clear a sign-in throttle, transfer and rename projects, replace a leaked review link, open or close registration, and read the last 100 changes. Email/role changes, suspension and password changes end the person's sessions. You cannot suspend or demote yourself, and at least one active administrator always remains, enforced in Postgres and safe against two admins acting at once. Passwords are never shown, logged or emailed.

## Migrating from the SQLite version

```sh
npm run import:legacy -- --db path/to/studio.sqlite --uploads path/to/public/uploads --dry-run
npm run import:legacy -- --db path/to/studio.sqlite --uploads path/to/public/uploads
```

Accounts, roles, suspended status, projects, consultant answers and photos move across. **Review links keep their share ID, so links already sent to consultants keep working.** Passwords cannot be moved (the old scrypt hashes are not a format Supabase accepts), so imported accounts get a random password and people choose their own with "Forgot password?". Running it twice is safe.

## Brand and theming

Orange, black and white, in light and dark. Both palettes live as CSS custom properties at the top of `app/globals.css`: `:root` is the light theme and `:root[data-theme="dark"]` overrides it. Everything else — Tailwind utilities (`bg-paper`, `text-muted`, `bg-brand`), the landing page, the admin dashboard and the three.js viewer — reads those tokens, so changing a colour is a one-line edit in one file and no `dark:` variants exist anywhere.

The theme switch (`components/ThemeToggle.tsx`) reads `<html data-theme>` as its source of truth, stores the choice in `localStorage` (`fuddo-theme`), and follows the operating system until a choice is made. A small inline script in `app/layout.tsx` sets the attribute before first paint, so dark-mode visitors never get a white flash.

## Hero art

The landing page opens on the product's own output: `components/HeroPlate.tsx` shows a still, then code-splits three.js in once the page is idle so the plate becomes something a visitor can turn. Regenerate the stills and glTF after changing the engine:

```sh
node scripts/hero-shot.mjs            # all three concepts
node scripts/hero-shot.mjs "Tall stack" --size 1600
```

## Project layout

```
app/                  pages and API routes (thin: validate, call the backend, respond)
  api/                auth, projects, review (public), generate, render, model, upload, admin, card
  auth/  studio/  admin/  review/[shareId]/  card/[id]/
components/           UI (ComponentList, RefineView, ModelViewer, ReviewClient, …)
lib/
  backend/            the data contract (types.ts) and its Supabase implementation, limiter, cookie policy
  engine/layout/      where things go on the plate: anchors, sauce, separation, plates, elevations
  engine/gltf/        the 3D shape library and glTF writer, one file per family of shapes
  providers/          image providers (mock, OpenAI) · providers3d/
  render.ts  auth.ts  quota.ts  config.ts  schemas.ts  pricing.ts  …
supabase/migrations/  schema, Row Level Security, functions, storage policies
tests/                unit/  integration/  e2e/
docs/                 ARCHITECTURE.md, SECURITY.md, CHANGES.md, original-plans/
proxy.ts              refreshes the session and guards the signed-in pages
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY.md`](docs/SECURITY.md), and what changed from the original: [`docs/CHANGES.md`](docs/CHANGES.md).

## Before public launch

- Configure a real SMTP provider for password-reset and confirmation emails.
- Put request-size and IP throttling at your edge as well (the app limits what it can, per address and per account).
- Uploaded and generated images are public *by unguessable URL*, like any image on the web; they are not access-controlled.
- Review links are bearer credentials by design. Anyone with the link can view the spread and answer; administrators can replace a leaked link from `/admin`.
