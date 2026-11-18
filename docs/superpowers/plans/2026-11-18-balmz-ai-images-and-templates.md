# BALMZ AI Images and Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the Images workspace show broad category coverage, useful fallback results and visually meaningful reusable templates.

**Architecture:** Keep the current authenticated Wikimedia Commons API as the primary source and extend the curated fallback with category-tagged Unsplash references. Keep template metadata in the Images workspace, adding real preview image URLs and structured prompt text.

**Tech Stack:** Next.js 15.5, React 19, TypeScript, existing Wikimedia Commons API and Unsplash image CDN.

**Spec:** `docs/superpowers/specs/2026-11-18-balmz-ai-workspace-expansion-design.md`

## Global Constraints

- Keep Images behind the existing authenticated route and API session check.
- Preserve per-image source, creator, license and license URL.
- Never describe curated inspiration as a live popularity ranking.
- Do not invent attributions or claim Unsplash photos are public domain.
- Keep all prompts editable and avoid fake statistics, testimonials, guarantees or trademark imitation.

## Review Focus

- Empty category fallback returns useful images rather than an empty list.
- Search terms that do not match a curated title still return category-relevant images.
- All category IDs match between UI and API validation.
- Images remain responsive and have meaningful alternative text.
- Template cards remain usable on mobile and with long prompts.

---

### Task 1: Expand category definitions and fallback images

**Files:**
- Modify: `app/api/images/free-library/route.ts`
- Modify: `app/dashboard/images/images-workspace.tsx`

**Interfaces:**
- Preserve the API query contract `GET /api/images/free-library?category=<id>&q=<query>`.
- Preserve the existing `LibraryImage` response fields.

- [ ] Add assertions/checks for the full category ID list and category fallback coverage.
- [ ] Verify the focused checks fail against the current seven-category source.
- [ ] Add food, technology, architecture, business, fashion, sports, education, lifestyle, space, backgrounds and wallpapers category metadata and search terms.
- [ ] Expand curated fallback photos by category; retain HTTPS Unsplash URLs and truthful Unsplash License attribution links.
- [ ] Run `pnpm run typecheck` and `pnpm run build`; inspect the API route diff.

### Task 2: Add template catalog entries and previews

**Files:**
- Modify: `app/dashboard/images/images-workspace.tsx`

**Interfaces:**
- Preserve `Template` prompt handoff through `/dashboard?prompt=<encoded prompt>`.
- Extend the template type with a stable preview source and optional aspect-ratio metadata.

- [ ] Add checks for the new template IDs/titles and preview sources.
- [ ] Verify the checks fail before adding the new templates.
- [ ] Add business card, flyer, menu, website hero, app concept, book cover, podcast cover, product mockup, infographic, invitation, ad creative and presentation-layout prompts.
- [ ] Render image previews instead of symbol-only gradient placeholders, with fallback presentation if a thumbnail fails.
- [ ] Run `pnpm run typecheck` and `pnpm run build`; review responsive layout and escaping.

### Task 3: Verify production gallery behavior

**Files:**
- No production data changes.

- [ ] Open the authenticated gallery in a real session.
- [ ] Verify every category returns images or a truthful no-results response.
- [ ] Verify Unsplash/Commons source and license links.
- [ ] Verify template previews, search, Copy prompt and Use in chat.
- [ ] Confirm the latest Render deploy is `live` before describing the slice as deployed.
