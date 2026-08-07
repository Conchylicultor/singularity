-- Custom SQL migration file, put your code below! --
-- migration: 20260807_164345__backfill_conversation_categories --

-- Carry every existing single-category classification into the new
-- one-row-per-(conversation, category) table, under the `type` category — the
-- one the committed config now holds the previous flat label list in
-- (config/conversations/conversation-category/config.jsonc).
--
-- The id is the deterministic `categoryRowId(conversationId, categoryId)`, NOT
-- a generated uuid: data migrations are re-hashed and re-applied whenever their
-- content changes, so this must be idempotent. `ON CONFLICT DO NOTHING` makes a
-- re-apply a no-op rather than a duplicate-key failure.
--
-- Labels that are no longer in the configured item list (three of them, ~12
-- rows) come across verbatim on purpose: a stale label still renders, whereas
-- dropping the row would silently lose the classification.
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
