-- Custom SQL migration file, put your code below! --
-- migration: 20260710_120000__repair_block_data --

-- Repair `page_blocks.data` rows that predate write-boundary validation
-- (`parseBlockData`). Two independent malformations, each guarded + idempotent
-- so this is fork-safe (it may run against DBs where either is already a no-op).
--
-- 1. `type = 'page'` rows created without an `icon` key. `PageDataSchema.icon`
--    is `.nullable()` but NOT `.optional()`, so `pageData()` threw
--    `invalid_type` at ["icon"] in a push-resource loader
--    (website/blog/publish), the search reindex job (pages/content-search), and
--    the tab-title derivation (apps.surface). Backfill the missing key with the
--    JSON null the schema accepts (jsonb_set create_missing defaults true).
--
-- 2. `text` injected into VOID (text-less) block types by the slash / markdown
--    convert path, which blind-spread `text: remaining` onto any target's
--    payload. None of these types' `defineBlock` schemas has a `text` field
--    (verified per type: audio/file/image/video = attachment fields, bookmark =
--    url + OG metadata, divider = {}, embed = {url}, equation = {expression},
--    page-link = {pageId}, page = {title,icon,cover}, code-block = {code,
--    language} — it stores `code`, never `text`), so the key is pure cruft;
--    strip it. Text-bearing types (text, headings, quote, callout, to-do,
--    toggle, bulleted/numbered-list) are deliberately EXCLUDED so their content
--    is never touched.
--
-- Idempotent: after one run, statement 1 selects no `page` row missing `icon`,
-- and statement 2 selects no row of these types still carrying a `text` key.

UPDATE page_blocks
SET data = jsonb_set(data, '{icon}', 'null')
WHERE type = 'page' AND NOT (data ? 'icon');

UPDATE page_blocks
SET data = data - 'text'
WHERE data ? 'text'
  AND type IN ('audio','bookmark','divider','embed','equation','file',
               'image','page','page-link','video','code-block');
