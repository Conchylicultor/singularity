-- Custom SQL migration file, put your code below! --
-- migration: 20260716_115802__normalize_block_text_runs --

-- Collapse legacy string `data.text` to canonical runs:
--   ""      -> []
--   "hello" -> [{"text": "hello"}]
--
-- Companion to retiring the `string | RichText` union from `RichTextSchema`
-- (plugins/page/plugins/editor/core/rich-text.ts): stored rows become runs-only;
-- the write boundary (parseBlockData) normalizes any string still arriving from
-- pre-migration history snapshots on restore.
--
-- Guarded on jsonb_typeof so it only rewrites string-typed text and is
-- idempotent (a second run matches nothing). Void block types never carry a
-- `text` key (repaired by 20260710_120000_577ba77b__repair_block_data), so
-- value-type scoping alone is sufficient and type-agnostic. `data->'text'`
-- preserves the string verbatim, including [[<pageId>]] tokens.
UPDATE page_blocks
SET data = jsonb_set(data, '{text}',
  CASE WHEN data->>'text' = '' THEN '[]'::jsonb
       ELSE jsonb_build_array(jsonb_build_object('text', data->'text')) END)
WHERE jsonb_typeof(data->'text') = 'string';
