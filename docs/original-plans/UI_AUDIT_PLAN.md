# UI Audit & Sizing/Typography Implementation Plan

**Project:** FUDDO AI — Plating Studio  
**Role:** Senior Frontend Engineer & UI Reviewer  
**Target Path:** `implementation/UI_AUDIT_PLAN.md`  
**Status:** Phase 0–Phase 4 UI Polish Pass Complete & Verified (Build passing clean with zero errors)

---

## 1. Project Analysis (STEP 1)

### 1.1 Tech Stack & Framework Identification
- **Framework:** Next.js 16.3.4 (App Router) + React 19.2.8 + TypeScript 5
- **Styling Methodology:** 
  - Tailwind CSS v4 (`@import "tailwindcss";` in `app/globals.css` with `@theme inline` mapped CSS variables).
  - Custom CSS Design Tokens & Layers (`:root`, `:root[data-theme='dark']`, `@layer base`, `@layer components`).
  - Feature-Specific CSS Files (`app/admin/admin.css` for Admin Dashboard, `app/burger.css` for Auth micro-animations).
- **UI & Graphics Libraries:** Vanilla HTML/CSS + Tailwind utilities, custom SVG icons, Three.js 0.186.0 (`@types/three`) for 3D dish model rendering (`components/ModelViewer.tsx`).

### 1.2 Global Styles, Fonts & Design Tokens Location
1. **`app/globals.css`**: Defines core CSS variables, dark mode overrides, Tailwind v4 theme mapping (`@theme inline`), webkit scrollbar styles, motion-reduction rules, and base typography utility classes (`.display`, `.eyebrow`).
2. **`app/layout.tsx`**: Configures Next.js Google Fonts `Geist` (`--font-geist-sans`) and `Geist_Mono` (`--font-geist-mono`). Inlines critical FOUC-prevention JS `themeScript` to set `data-theme` on `<html>` before paint.
3. **`app/admin/admin.css`**: Manages admin dashboard layout, tables, modal dialogs, and controls.
4. **`app/burger.css`**: Keyframe animations and absolute pixel-based positioning for the animated burger illustration in auth views.

---

## 2. UI Audit Findings Log (Phase 0 – Phase 4 Pass)

| File:Line | Current Issue | Replacement / Fix |
| :--- | :--- | :--- |
| `app/globals.css:69-81` | `--text-*` and `--radius-*` declared inside `:root` (ignored by Tailwind v4 utilities) | Moved into `@theme inline` with matching `--text-*--line-height` definitions |
| `app/globals.css:196-280 & 442-500` | Duplicate `.btn-*` declarations outside and inside `@layer components` | Consolidated into single `@layer components` section with `.btn`, `.btn-sm`, `.btn-md`, `.btn-lg`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-approve` |
| `app/globals.css:216,247` | Missing focus rings on `.btn-*` classes | Added `focus-visible:outline-2 focus-visible:outline-offset-2` |
| `components/AccountNav.tsx:20` | `flex flex-wrap` causing 2-line wrap at 375px | Changed to `flex-nowrap items-center justify-between min-h-11` and added user name truncation (`truncate max-w-[130px]`) |
| `app/studio/page.tsx:260` | Fixed container max-width | Wrapped in shared `<PageContainer className="py-6 md:py-8">` |
| `app/studio/page.tsx:291` | `grid gap-6 lg:grid-cols-[340px_1fr]` (doesn't stack below md) | Refactored to `grid grid-cols-1 md:grid-cols-[340px_1fr] gap-6` |
| `app/studio/page.tsx:299,315,336,396,401,411,437,445,458,485,498,558` | Arbitrary `text-[11px]` and `file:text-[11px]` classes | Replaced with token `text-xs` (and `file:text-xs text-base md:text-sm` for fields) |
| `app/studio/page.tsx:367,375` | `text-[9px]` icon buttons with small touch area | Replaced with `text-xs min-h-11 min-w-11 flex items-center justify-center` (44px tap target) |
| `app/studio/page.tsx:423` | Inline primary action button | Wrapped in mobile sticky bottom bar `sticky bottom-0 z-20 bg-paper/90 backdrop-blur-md pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 md:relative md:bg-transparent md:p-0` |
| `app/studio/page.tsx:527` | Hardcoded `min-h-[420px]` | Replaced with `min-h-80` |
| `app/studio/page.tsx:550` | Heading using `text-[15px]` | Standardized to `h3 className="display text-sm leading-snug"` |
| `components/RefineView.tsx:330` | `grid gap-6 lg:grid-cols-[1fr_300px]` | Refactored to `grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6` |
| `components/RefineView.tsx:373,380,464,475,562,568,581,643,698,771` | Arbitrary `text-[11px]` classes | Replaced with token `text-xs` and added `min-h-11` tap targets |
| `components/CardClient.tsx:108,137` | Fixed `max-w-[820px]` container | Replaced with shared `<PageContainer className="max-w-3xl">` |
| `components/CardClient.tsx:156` | Fixed `grid-cols-3` for multi-view renders | Refactored to `grid grid-cols-1 sm:grid-cols-3 gap-4` |
| `components/ReviewClient.tsx:141` | `h1` missing responsive scaling | Updated to `h1 className="display text-2xl md:text-4xl"` |
| `components/ReviewClient.tsx:148,351` | Hand-styled buttons with padding/borders | Converted to `.btn btn-sm` and `.btn btn-secondary btn-sm` |
| `components/ReviewClient.tsx:183,244` | Hardcoded `h-[320px]` and `h-[440px]` viewports | Replaced with `h-72` and `h-80 sm:h-96` |
| `components/ReviewClient.tsx:187,188,207,213,234,272,288,318,342,365,374` | Arbitrary `text-[11px]` and `text-[9px]` classes | Replaced with `text-xs` and `text-sm` scale tokens |
| `components/AdminDashboard.tsx:75` | `h1` heading missing responsive scale | Updated to `h1 className="text-2xl md:text-4xl font-extrabold tracking-tight"` |
| `components/AdminDashboard.tsx:81` | Stat number using raw size | Standardized to `strong className="text-3xl font-semibold tabular-nums text-brand-ink"` |
| `components/AdminDashboard.tsx:87,88,89` | Table container lacking mobile scroll wrapper | Wrapped in `<div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">` |
| `components/AdminDashboard.tsx:92,96,107,108` | Form inputs using default size | Added `text-base md:text-sm` to prevent iOS Safari focus zoom |
| `app/page.tsx:176` | Duplicate squished `Enter studio` button inside `<nav>` conflicting with `.land-nav > nav a` styles | Removed duplicate `<Link>` inside `<nav>`; retained single full-sized `.nav-button` in `.nav-tools flex items-center gap-4` |

---

## 3. Verification & Build Results

1. **Build & Typecheck Verification:**
   - Command: `npm run build`
   - Result: `✓ Compiled successfully in 1075ms` with zero TypeScript compilation errors or route warnings.

2. **Responsive Audit (375px, 768px, 1280px):**
   - **Landing (`app/page.tsx`):** Hero headline is single `<h1>`. Layout scales cleanly from 375px to 1280px.
   - **Studio (`app/studio/page.tsx` & `RefineView.tsx`):** Side-by-side controls stack below 768px (`md:`). Primary actions sit in sticky bottom bar on mobile (`sticky bottom-0`). Tap targets meet 44x44px min.
   - **Card (`app/card/[id]/page.tsx` & `CardClient.tsx`):** Container max-w-3xl, multi-angle view figures stack at 375px (`grid-cols-1 sm:grid-cols-3`). `await params` Next.js 16 compliant.
   - **Review (`app/review/[shareId]/page.tsx` & `ReviewClient.tsx`):** Full heading ladder (`text-2xl md:text-4xl`), all buttons converted to `.btn-*`, 3D viewport height clamped (`h-80 sm:h-96`).
   - **Admin (`AdminDashboard.tsx` & `admin.css`):** Stat numbers standardized to `text-3xl font-semibold tabular-nums`. Tables wrapped in `-mx-4 px-4 md:mx-0 md:px-0` for clean horizontal scroll on 375px.

3. **Accessibility & Focus Styles:**
   - Standard focus-visible outline added to all `.btn-*` classes (`focus-visible:outline-2 focus-visible:outline-offset-2`).
   - Inputs use `text-base md:text-sm` to prevent Safari auto-zoom on mobile focus.

