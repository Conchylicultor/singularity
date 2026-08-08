-- Custom SQL migration file, put your code below! --
-- migration: 20260808_014745__backfill_conversation_category_rows --

-- MIGRATE STEP of the expand → migrate → contract table swap.
--
-- Carries every pre-multi-category classification from the 1:1 side table into
-- the new one-row-per-(conversation, category) table, under the `type` category
-- — the one the committed config holds the previous flat label list in
-- (config/conversations/conversation-category/config.jsonc).
--
-- Ordering is why this is a second push rather than a second statement: `push`
-- regenerates branch-local SCHEMA migrations into one stamped at push time while
-- leaving DATA migrations at theirs, so a backfill can never be ordered after a
-- table its own branch creates. `conversation_categories` was created by the
-- previous push and is already on main, so this file is safely after it and
-- safely before the DROP that this push generates.
--
-- The id is the deterministic `categoryRowId(conversationId, categoryId)`, NOT a
-- generated uuid: data migrations are re-hashed and re-applied whenever their
-- content changes, so this must be idempotent. `ON CONFLICT DO NOTHING` makes a
-- re-apply a no-op rather than a duplicate-key failure.
--
-- Labels no longer present in the configured item list come across verbatim on
-- purpose: a stale label still renders, whereas dropping the row would silently
-- lose the classification.
INSERT INTO conversation_categories
  (id, conversation_id, category_id, item, source, created_at, updated_at)
SELECT
  parent_id || ':type',
  parent_id,
  'type',
  category,
  source,
  created_at,
  updated_at
FROM conversations_ext_category
ON CONFLICT (id) DO NOTHING;
