-- Custom SQL migration file, put your code below! --
-- migration: 20260723_095002__collapse_existing_sub_pages --

-- Inline nested-page expansion (research/2026-07-23-page-inline-nested-page-expansion.md):
-- `expanded` on a `type = 'page'` row now controls whether the sub-page's
-- blocks are spliced inline into the parent's editor. The column default is
-- `true` (content blocks need it), so without this backfill every existing
-- sub-page would auto-expand on upgrade. Collapse them once; pages the user
-- expands from here on persist their own state.
--
-- Idempotent: after one run, every `page` row already has `expanded = false`
-- until a user expands it, and re-running only re-collapses `page` rows.

UPDATE page_blocks
SET expanded = false
WHERE type = 'page';
