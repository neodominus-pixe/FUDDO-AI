# Security model

## Principles

1. **The database enforces what matters.** The Supabase anon key ships to browsers by design. It is safe because every table is behind Row Level Security and every privileged operation is a function that checks the caller. Application code adds friendly errors and speed, not the only protection.
2. **Never trust stored JSON.** Owners write their projects straight to Postgres with their own session, so what a consultant's request reads is untrusted. It is validated with Zod before it reaches the layout engine, and the database constrains its size and shape.
3. **Public means read-only.** The review link can view a spread and record an answer. It cannot create, spend, or read anything else.
4. **Say the same thing whether or not it is true.** Sign-in, sign-up and password reset never reveal whether an address has an account.

## Threats and where they are handled

| Threat | Handling |
|---|---|
| Guessing passwords | Supabase Auth hashing; failed-attempt throttle per (address, account) and per address, stored in Postgres; policy 12–128 |
| Locking a victim out by guessing their email | Only failures count and the account counter is per source address, so an attacker locks out only themselves |
| Forged sign-in / state-changing requests (CSRF) | Same-origin check on every non-GET; `SameSite=Lax` cookies; JSON bodies only |
| Session theft | HttpOnly cookies, `Secure` in production; sign-out revokes server-side; password change and reset revoke all other sessions; suspension ends sessions |
| Self-promotion to admin | `profiles.role` is not writable by clients (column privileges); the trigger always creates `user`; admin functions check the caller |
| Bypassing "registration closed" via the raw Auth API | Enforced by a trigger on `auth.users`; an admin's own account creation goes through a one-shot, email-scoped, service-only approval |
| Owner tampering with ownership, share link, or the consultant's answer | A `BEFORE UPDATE` trigger resets `owner_id`, `share_id` and `review` for non-admins; only `submit_review` may write a review |
| Malicious dish data (huge, hostile, or crafted to stall the engine) | Zod bounds on every field; CHECK constraints on JSON size and array length; colours must be hex (they are interpolated into SVG); photo URLs must be `http(s)` |
| SSRF through a photo URL | The server only ever fetches images from its own Storage bucket (`readPhoto` checks the exact prefix and a strict path charset) |
| Fake image uploads (script or HTML named `.png`) | Content sniffed from the bytes (magic numbers), bucket restricted to JPEG/PNG/WebP, 12 MB cap, users can only write inside their own folder |
| Running up the image bill | Paid images cached by content hash; public routes cannot generate; hourly per-chef allowance counted at the moment of spend |
| Hammering a review link | Per-connection throttle in the API and a per-link hourly cap inside the database function |
| Two admins demoting each other | Serialised with an advisory lock and re-checked inside the same transaction |
| Leaked review link | Administrators can replace it (typed confirmation); the old link stops working immediately |
| Information leaks in errors | Routes return structured messages; unexpected errors are logged server-side and answered generically |
| Clickjacking, MIME sniffing | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production |

## What is verified, and how

- `npm run test:db` — 79 tests against a real Supabase, each acting as real users: what each role can read and write, the triggers, the admin functions (including the concurrent-demotion race), Storage isolation, the rate limiter, and the importer.
- `npm run test:e2e` — 25 tests over HTTP with real cookies: cookie flags, sign-out really revoking, lockout behaviour, no enumeration, the whole chef → consultant loop, upload sniffing, admin flows, and password recovery using a real captured email.
- `npm test` — 176 unit tests (schemas, limiter semantics, cookie policy, image sniffing, engine).

## Known limits

- **Review links are bearer credentials.** That is the point (no account for the consultant), but anyone who obtains the link can answer. Rotate it from `/admin` if it leaks.
- **Images are public by URL.** Paths are unguessable but not access-controlled.
- **`X-Forwarded-For` is only honoured with `TRUST_PROXY=1`.** Without it every visitor shares one address bucket, which is safe but coarse; behind a proxy you control, set it.
- **The access token outlives a revoked session** until it expires (Supabase default: 1 hour). Suspension takes effect immediately because RLS checks the `disabled` flag on every query; session revocation affects refresh and `getUser()` checks, which is what the app uses.
- **SMTP.** Supabase's built-in mail sender is rate-limited and for testing; configure your own before launch.
- **No Content-Security-Policy yet.** The inline theme script and Three.js make a strict CSP a project of its own; the other headers are in place.
