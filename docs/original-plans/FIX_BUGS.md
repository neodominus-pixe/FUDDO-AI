# Bug Fixes & Defect Resolution Plan

This document contains a comprehensive, self-contained checklist of all identified bugs, broken features, and logic errors in the FUDDO AI codebase. Each bug report details the exact location, description, root cause analysis, severity level, and step-by-step resolution steps.

---

## Table of Contents
1. [BUG-01: `checkPassword` Uncaught Exception & Server Crash on Invalid Password Hashes](#bug-01-checkpassword-uncaught-exception--server-crash-on-invalid-password-hashes)
2. [BUG-02: OpenAI Image Provider Returns Expiring Temporary S3 URLs](#bug-02-openai-image-provider-returns-expiring-temporary-s3-urls)
3. [BUG-03: Flawed Email-Only Rate Limiting (Account Lockout DoS & Missing IP Limiting)](#bug-03-flawed-email-only-rate-limiting-account-lockout-dos--missing-ip-limiting)
4. [BUG-04: Missing Delete Project Endpoint and Store Functionality](#bug-04-missing-delete-project-endpoint-and-store-functionality)
5. [BUG-05: Landing Page Interactive Demo Uncaught Exception on Custom Component Names](#bug-05-landing-page-interactive-demo-uncaught-exception-on-custom-component-names)
6. [BUG-06: Hard Page Reload Navigation Anti-Pattern Using `location.href`](#bug-06-hard-page-reload-navigation-anti-pattern-using-locationhref)
7. [BUG-07: Duplicate Database Read on Single Project API Endpoint](#bug-07-duplicate-database-read-on-single-project-api-endpoint)
8. [BUG-08: Admin Project Operations Bypassing Database Transaction & Audit Integrity](#bug-08-admin-project-operations-bypassing-database-transaction--audit-integrity)

---

## Bug Reports

### BUG-01: `checkPassword` Uncaught Exception & Server Crash on Invalid Password Hashes
- **Severity**: Critical
- **Status**: Fixed
- **Location**: [`lib/auth.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/auth.ts#L15-L27), [`app/api/auth/[action]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/auth/[action]/route.ts#L51)
- **Description**: If a user record in SQLite has a missing, malformed, or invalid password hash string (or if dummy fallback values fail formatting), calling `checkPassword` throws an unhandled `TypeError` that crashes the server request with HTTP 500.
- **Root Cause**:
  1. `stored.split(':')` assumes the string always contains a colon `:` yielding a 2-element array `[salt, hash]`. If `hash` is `undefined`, `Buffer.from(hash, 'hex')` throws `TypeError: First argument must be a string...`.
  2. `node:crypto`'s `timingSafeEqual(bufA, bufB)` strictly requires `bufA` and `bufB` to have identical `byteLength`. If `key` (64 bytes) and `Buffer.from(hash, 'hex')` have different lengths (e.g. invalid hash string in DB), `timingSafeEqual` throws `TypeError: Inputs must have the same length`.
- **Fix Checklist**:
  - [x] Update `checkPassword` in [`lib/auth.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/auth.ts#L15-L27) to validate `stored` format before performing scrypt key derivation.
  - [x] Add explicit checks to verify `salt` and `hash` existence and non-empty status.
  - [x] Verify that `Buffer.from(hash, 'hex')` length matches the derived scrypt key length (64 bytes) prior to calling `timingSafeEqual`.
  - [x] Wrap `checkPassword` in a `try/catch` block that returns `false` on any parsing or length error instead of throwing.

---

### BUG-02: OpenAI Image Provider Returns Expiring Temporary S3 URLs
- **Severity**: Critical
- **Status**: Fixed
- **Location**: [`lib/providers/openai.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/providers/openai.ts#L52-L122)
- **Description**: Generated images using the OpenAI provider break after 1 hour when viewed by chefs or consultants.
- **Root Cause**: In `generate()`, when `refs.length === 0`, `fetch('https://api.openai.com/v1/images/generations')` is called without specifying `response_format: 'b64_json'`. OpenAI defaults to returning a temporary S3 URL (`first.url`) which expires in 60 minutes.
- **Fix Checklist**:
  - [x] Update POST payload in [`lib/providers/openai.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/providers/openai.ts#L72-L89) to include `response_format: 'b64_json'`.
  - [x] Ensure `first.b64_json` is always saved locally to disk via `save(first.b64_json, req)` under `/public/generated/`.
  - [x] Add fallback image saving logic `saveUrl(url, req)` if a remote URL is returned, fetching and persisting the file to `/public/generated/`.

---

### BUG-03: Flawed Email-Only Rate Limiting (Account Lockout DoS & Missing IP Limiting)
- **Severity**: Critical
- **Status**: Fixed
- **Location**: [`lib/auth.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/auth.ts#L35-L48), [`app/api/auth/[action]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/auth/[action]/route.ts#L32-L52)
- **Description**: An attacker can lock out any legitimate chef from logging in or registering by sending 10 failed signin requests with that chef's email. Furthermore, successful logins do not clear failed attempts, and there is no rate limiting by client IP address.
- **Root Cause**:
  1. `rateLimited(key)` hashes `email` as the rate limiting key without tracking the caller's IP address.
  2. `rateLimited(email)` is checked before password verification, permitting unauthenticated callers to increment the attempt counter for target emails.
  3. `auth_attempts` table records are not deleted or reset upon successful authentication.
- **Fix Checklist**:
  - [x] Modify `rateLimited` in [`lib/auth.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/auth.ts#L35-L43) to accept limits and window parameters.
  - [x] Implement dual-key rate limiting: track IP-level attempts (`ip:${ip}`) and email-level attempts (`email:${email}`).
  - [x] Extract client IP address securely in [`app/api/auth/[action]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/auth/[action]/route.ts) using `x-forwarded-for` or request headers.
  - [x] Create a `clearRateLimit(key: string)` helper in [`lib/auth.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/auth.ts#L44-L47) that deletes records from `auth_attempts`.
  - [x] Call `clearRateLimit` in `app/api/auth/[action]/route.ts` after successful authentication.

---

### BUG-04: Missing Delete Project Endpoint and Store Functionality
- **Severity**: Moderate
- **Status**: Fixed
- **Location**: [`lib/store.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/store.ts#L91-L99), [`app/api/projects/[id]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/projects/[id]/route.ts#L54-L68)
- **Description**: Projects cannot be deleted by project owners or workspace administrators. There is no store method or API route handling HTTP `DELETE`.
- **Root Cause**: `lib/store.ts` only implements `createProject`, `getProject`, `getProjectByShareId`, `updateProject`, and `listProjects`. `app/api/projects/[id]/route.ts` only handles `GET` and `PATCH`.
- **Fix Checklist**:
  - [x] Implement `deleteProject(id: string): Promise<boolean>` in [`lib/store.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/store.ts#L91-L99) that unlinks `data/projects/${id}.json`.
  - [x] Export `DELETE` handler in [`app/api/projects/[id]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/projects/[id]/route.ts#L54-L68).
  - [x] Apply `apiGuard` and check project ownership or admin role before deletion.
  - [x] Audit project deletion events in `admin_events` table when deleted by an admin.

---

### BUG-05: Landing Page Interactive Demo Uncaught Exception on Custom Component Names
- **Severity**: Moderate
- **Status**: Fixed
- **Location**: [`app/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/page.tsx#L353)
- **Description**: In the landing page interactive demo (`#try`), if `picked` array contains an ingredient name not present in the static `INGREDIENTS` array, the page crashes with a blank screen.
- **Root Cause**: Line 350 executes `const item = INGREDIENTS.find((x) => x.name === name)!`. The non-null assertion `!` fails if `item` is `undefined`, causing `item.color` to throw `TypeError: Cannot read properties of undefined (reading 'color')`.
- **Fix Checklist**:
  - [x] Replace non-null assertion in [`app/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/page.tsx#L353) with safe fallback values: `const item = INGREDIENTS.find((x) => x.name === name) ?? { name, color: '#8b5cf6' }`.

---

### BUG-06: Hard Page Reload Navigation Anti-Pattern Using `location.href`
- **Severity**: Minor
- **Status**: Fixed
- **Location**: [`app/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/page.tsx#L138), [`app/auth/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/auth/page.tsx#L16), [`components/AdminDashboard.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/AdminDashboard.tsx#L33-L34)
- **Description**: Navigating between pages uses `location.href = ...` which causes a full browser page refresh, losing in-memory application state and ignoring Next.js router transitions.
- **Root Cause**: Direct DOM assignment to `location.href` instead of Next.js `useRouter().push()`.
- **Fix Checklist**:
  - [x] Import `useRouter` from `next/navigation` in [`app/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/page.tsx), [`app/auth/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/auth/page.tsx), and [`components/AdminDashboard.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/AdminDashboard.tsx).
  - [x] Replace `location.href = '/auth?next=/studio'` in `app/page.tsx` with `router.push('/auth?next=/studio')`.
  - [x] Replace `location.href = data.user.role === 'admin' ? '/admin' : '/studio'` in `app/auth/page.tsx` with router calls.
  - [x] Replace `location.href` redirects in `AdminDashboard.tsx` with Next.js router calls.

---

### BUG-07: Duplicate Database Read on Single Project API Endpoint
- **Severity**: Minor
- **Status**: Fixed
- **Location**: [`app/api/projects/[id]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/projects/[id]/route.ts#L18-L24)
- **Description**: Requesting a project by ID reads and parses the JSON file twice from disk sequentially.
- **Root Cause**:
  Line 20: `const owned = await getProject(id)`
  Line 22: `const project = await getProject(id)`
- **Fix Checklist**:
  - [x] Remove duplicate `const project = await getProject(id)` call on line 22 of [`app/api/projects/[id]/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/projects/[id]/route.ts).
  - [x] Reuse the single `project` object fetched on line 19.

---

### BUG-08: Admin Project Operations Bypassing Database Transaction & Audit Integrity
- **Severity**: Minor
- **Status**: Fixed
- **Location**: [`app/api/admin/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/admin/route.ts#L36-L58)
- **Description**: When performing admin actions `updateProject` or `rotateShare`, project edits occur without transaction boundaries. If audit logging or project updates fail partially, database audit events and file storage become out of sync.
- **Root Cause**: Lines 36-51 return early before reaching the `BEGIN IMMEDIATE` transaction block used by user-related admin actions.
- **Fix Checklist**:
  - [x] Wrap project administration actions in [`app/api/admin/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/admin/route.ts) in error handling and verification prior to auditing.
  - [x] Ensure project updates and audit entries fail gracefully if store operation fails.
