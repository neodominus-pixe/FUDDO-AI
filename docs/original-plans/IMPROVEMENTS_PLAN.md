# Website Improvements Plan

This document outlines prioritized, meaningful improvements across four core areas: Code Quality, Performance, UI/UX, and Project Structure. Each proposal includes a detailed description, impact rationale, and actionable checklist items with concrete sub-steps.

---

## Table of Contents
1. [Area 1: Code Quality & Reliability](#area-1-code-quality--reliability)
   - [QUAL-01: Unified SQLite Persistence Layer for Projects](#qual-01-unified-sqlite-persistence-layer-for-projects)
   - [QUAL-02: Type-Safe Input Validation with Zod Schemas](#qual-02-type-safe-input-validation-with-zod-schemas)
   - [QUAL-03: Standardized API Error Handling Pipeline](#qual-03-standardized-api-error-handling-pipeline)
2. [Area 2: Performance & Scalability](#area-2-performance--scalability)
   - [PERF-01: Eliminate $O(U \times P)$ Linear Disk Scanning](#perf-01-eliminate-ou-\times-p-linear-disk-scanning)
   - [PERF-02: Primitive Geometry & Material Caching in 3D Engine](#perf-02-primitive-geometry--material-caching-in-3d-engine)
   - [PERF-03: Optimized Image Loading & Responsive Assets](#perf-03-optimized-image-loading--responsive-assets)
3. [Area 3: UI / UX Enhancements](#area-3-ui--ux-enhancements)
   - [UIUX-01: Studio Component List Drag-and-Drop Reordering](#uiux-01-studio-component-list-drag-and-drop-reordering)
   - [UIUX-02: Mobile Touch Optimization for Plating Canvas & 3D Viewer](#uiux-02-mobile-touch-optimization-for-plating-canvas--3d-viewer)
   - [UIUX-03: 3D Model Viewer Accessibility & State Feedback](#uiux-03-3d-model-viewer-accessibility--state-feedback)
4. [Area 4: Project Structure & Maintainability](#area-4-project-structure--maintainability)
   - [STRUC-01: Modular Decomposition of Monolithic Engine Files](#struc-01-modular-decomposition-of-monolithic-engine-files)
   - [STRUC-02: Environment Configuration & Startup Diagnostics](#struc-02-environment-configuration--startup-diagnostics)
   - [STRUC-03: Automated Test Suite Implementation](#struc-03-automated-test-suite-implementation)

---

## Area 1: Code Quality & Reliability

### QUAL-01: Unified SQLite Persistence Layer for Projects
- **Priority**: High | **Impact**: High
- **Description**: Currently, user authentication, sessions, and settings reside in SQLite ([`lib/database.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/database.ts)), while projects reside in individual JSON files in `data/projects/` ([`lib/store.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/store.ts)). Replacing JSON file storage with SQLite tables unifies data management, eliminates file lock conflicts on Windows, and ensures transactional consistency.
- **Actionable Steps**:
  - [x] Create `projects` and `platings` tables in [`lib/database.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/database.ts) schema:
    ```sql
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
      shareId TEXT NOT NULL UNIQUE, dishName TEXT NOT NULL, dishJson TEXT NOT NULL,
      reviewJson TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(ownerId);
    CREATE INDEX IF NOT EXISTS idx_projects_shareId ON projects(shareId);
    ```
  - [x] Refactor [`lib/store.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/store.ts) to execute SQL queries using `DatabaseSync` instead of `node:fs` methods (`readdir`, `readFile`, `writeFile`).
  - [x] Create a automatic data migration utility in `scripts/migrate-projects.mjs` to read existing JSON files in `data/projects/` and import them into SQLite.
  - [x] Verify `getProject`, `getProjectByShareId`, `updateProject`, and `listProjects` functionality against SQLite queries.

---

### QUAL-02: Type-Safe Input Validation with Zod Schemas
- **Priority**: High | **Impact**: High
- **Description**: API routes currently check request bodies using manual `typeof` and regex conditions, which miss edge-case payloads and allow invalid data structures to enter store modules.
- **Actionable Steps**:
  - [x] Install `zod` dependency for schema validation.
  - [x] Create central validation schemas in `lib/schemas.ts` for:
    - Auth requests (`SignupSchema`, `SigninSchema`)
    - Dish & Component definitions (`ComponentSchema`, `DishSchema`)
    - Plating Specs (`PlatingSpecSchema`, `ElementTweakSchema`)
    - Project creation and patching (`CreateProjectSchema`, `PatchProjectSchema`)
  - [x] Replace manual `typeof` checks in [`app/api/generate/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/generate/route.ts), [`app/api/render/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/render/route.ts), [`app/api/model/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/model/route.ts), [`app/api/projects/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/projects/route.ts), and [`app/api/admin/route.ts`](file:///c:/Users/User/Desktop/FUDDO/app/api/admin/route.ts) with `Schema.safeParse()`.
  - [x] Return structured 400 Bad Request error details when validation fails.

---

### QUAL-03: Standardized API Error Handling Pipeline
- **Priority**: Medium | **Impact**: Medium
- **Description**: Error responses across API routes vary between plain text, HTML errors, and inconsistent JSON structures (`{ error: string }`, `{ message: string }`, `{ status: number }`).
- **Actionable Steps**:
  - [x] Create a centralized API response utility in `lib/api-response.ts`:
    - `apiSuccess(data, status = 200)`
    - `apiError(message, status = 400, code?: string)`
  - [x] Refactor all handlers under [`app/api/`](file:///c:/Users/User/Desktop/FUDDO/app/api/) to use standardized response helpers.
  - [x] Ensure uncaught server errors log full stack trace on server while returning safe, structured error responses to clients.

---

## Area 2: Performance & Scalability

### PERF-01: Eliminate $O(U \times P)$ Linear Disk Scanning
- **Priority**: High | **Impact**: High
- **Description**: `listProjects()` reads and parses every `.json` file in `data/projects/` sequentially. `adminData()` in [`lib/admin.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/admin.ts#L13-L25) calls `listProjects()` and then runs an inner loop filtering projects for every user ($O(U \times P)$ complexity with synchronous file reads).
- **Actionable Steps**:
  - [x] Replace file-system scans in `listProjects()` with indexed SQL queries: `SELECT * FROM projects ORDER BY updatedAt DESC`.
  - [x] Update `adminData()` to query project counts per user using SQL `GROUP BY`:
    ```sql
    SELECT ownerId, COUNT(*) AS count FROM projects GROUP BY ownerId;
    ```
  - [x] Benchmark `/api/admin` response time to ensure response duration remains under 20ms regardless of project count.

---

### PERF-02: Primitive Geometry & Material Caching in 3D Engine
- **Priority**: Medium | **Impact**: High
- **Description**: In [`lib/gltf.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/gltf.ts) and [`lib/model3d.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/model3d.ts), shape generation functions (`ball`, `baton`, `nest`, `shapedSolid`) allocate new `Float32Array` buffers and process trigonometric math on every single 3D render request.
- **Actionable Steps**:
  - [ ] Implement an in-memory LRU geometry cache for deterministic primitive shapes keyed by `(shapeName, seed, resolution)`.
  - [ ] Memoize unit sphere, unit cylinder, unit box, and plate profile lathe calculations in `lib/gltf.ts`.
  - [ ] Reuse compiled GLTF node material definitions when metallic, roughness, and color attributes are identical.

---

### PERF-03: Optimized Image Loading & Responsive Assets
- **Priority**: Medium | **Impact**: Medium
- **Description**: [`components/PlatingImage.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/PlatingImage.tsx), [`components/HeroPlate.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/HeroPlate.tsx), and [`components/ReviewClient.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/ReviewClient.tsx) use unoptimized standard HTML `<img>` elements without explicit width/height dimensions or modern formats.
- **Actionable Steps**:
  - [ ] Configure `next/image` domain patterns in [`next.config.ts`](file:///c:/Users/User/Desktop/FUDDO/next.config.ts) for local uploads and generated images.
  - [ ] Replace `<img>` tags in grid cards and preview thumbnails with Next.js `<Image />` components or add `loading="lazy"` and `decoding="async"`.
  - [ ] Add explicit width and height attributes to prevent Layout Instability (CLS).

---

## Area 3: UI / UX Enhancements

### UIUX-01: Studio Component List Drag-and-Drop Reordering
- **Priority**: High | **Impact**: High
- **Description**: In [`app/studio/page.tsx`](file:///c:/Users/User/Desktop/FUDDO/app/studio/page.tsx#L363-L380), reordering components in the stack currently uses tiny text buttons (`▲` / `▼`), which are difficult to tap on mobile screens and lack visual drag feedback.
- **Actionable Steps**:
  - [ ] Implement HTML5 drag-and-drop or pointer-based reordering for component list items in `app/studio/page.tsx`.
  - [ ] Add visual drag handles (`:::`) and drop target indicators to convey stack position clearly.
  - [ ] Retain accessible keyboard fallback controls (`Move Up` / `Move Down`) with improved target sizes.

---

### UIUX-02: Mobile Touch Optimization for Plating Canvas & 3D Viewer
- **Priority**: High | **Impact**: High
- **Description**: Drag handles in [`components/RefineView.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/RefineView.tsx#L441-L461) have small hitboxes (`h-3 w-3` for garnish, `h-6 w-6` for solids) that are difficult to press accurately on mobile touchscreens.
- **Actionable Steps**:
  - [ ] Increase invisible touch target hitboxes to at least `44px x 44px` while keeping visible indicator size crisp.
  - [ ] Add CSS `touch-action: none` to canvas container to prevent page scrolling while dragging elements.
  - [ ] Add haptic feedback or visual ripple effects when grabbing an element on touch devices.

---

### UIUX-03: 3D Model Viewer Accessibility & State Feedback
- **Priority**: Medium | **Impact**: Medium
- **Description**: The 3D model viewer ([`components/ModelViewer.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/ModelViewer.tsx), [`components/PlatingModel.tsx`](file:///c:/Users/User/Desktop/FUDDO/components/PlatingModel.tsx)) lacks loading indicators while Three.js mounts glTF buffers, and keyboard navigation is limited.
- **Actionable Steps**:
  - [ ] Add a visual loading spinner / skeleton overlay inside `PlatingModel.tsx` while 3D mesh is building.
  - [ ] Implement keyboard navigation controls (Arrow keys to orbit, `+`/`-` to zoom) when the 3D canvas is focused.
  - [ ] Add proper ARIA labels (`aria-label="Interactive 3D model viewer"`) and screen reader notifications when camera angles change.

---

## Area 4: Project Structure & Maintainability

### STRUC-01: Modular Decomposition of Monolithic Engine Files
- **Priority**: Medium | **Impact**: Medium
- **Description**: Core engine files have grown monolithic and hard to maintain: [`lib/layout.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/layout.ts) contains 883 lines, and [`lib/gltf.ts`](file:///c:/Users/User/Desktop/FUDDO/lib/gltf.ts) contains 1,945 lines.
- **Actionable Steps**:
  - [ ] Split `lib/layout.ts` into modular files under `lib/engine/layout/`:
    - `anchors.ts`: Composition presets and anchor calculations
    - `sauce.ts`: Sauce curve and mark positioning
    - `geometry.ts`: Plate profiles, height specs, and collision separation
  - [ ] Split `lib/gltf.ts` into modular files under `lib/engine/gltf/`:
    - `primitives.ts`: Core 3D geometry builders (`ball`, `baton`, `nest`, `shapedSolid`)
    - `shading.ts`: Contact shadows, browning, and mottle calculations
    - `writer.ts`: Binary glTF 2.0 array buffer assembly
  - [ ] Update imports across `lib/model3d.ts` and API routes.

---

### STRUC-02: Environment Configuration & Startup Diagnostics
- **Priority**: Medium | **Impact**: Medium
- **Description**: If required environment variables (e.g. `OPENAI_API_KEY`, `DATABASE_PATH`) are missing or invalid, errors only manifest deep inside request processing.
- **Actionable Steps**:
  - [ ] Create `lib/config.ts` to validate environment variables at server start.
  - [ ] Provide default fallback paths for `DATABASE_PATH` (`data/studio.sqlite`) and `PROJECTS_PATH` (`data/projects`).
  - [ ] Log clear warning messages when running in mock provider mode vs production API mode.

---

### STRUC-03: Automated Test Suite Implementation
- **Priority**: High | **Impact**: High
- **Description**: The project currently lacks automated unit tests for core deterministic plating algorithms, shape generators, and API route guards.
- **Actionable Steps**:
  - [ ] Setup Vitest test runner with Next.js environment configuration.
  - [ ] Add unit tests for `lib/layout.ts`:
    - Verify deterministic RNG produces identical output for identical seeds.
    - Verify separation algorithm keeps elements within plate boundary.
  - [ ] Add unit tests for `lib/auth.ts`:
    - Password hashing and verification.
    - Rate limit window calculations.
  - [ ] Add integration tests for `/api/auth` and `/api/projects` endpoints.
