-- Custom SQL migration file, put your code below! --
-- migration: 20260929_161450__page_icons_to_emoji --

-- Page icons become emoji (research/2026-09-29-page-emoji-page-icons.md).
--
-- `PageDataSchema.icon` narrows from a Material Symbols name (`SavedSymbolName`)
-- to `EmojiSchema` — exactly one RGI emoji grapheme. No symbol name has an emoji
-- spelling worth guessing (the auto-icon job picks one from the page's content
-- instead), so every stored page icon that is not an emoji is cleared to NULL —
-- the "no icon" state, drawn as the default document glyph:
--
--   page_blocks.data (type 'page')     `icon` -> null
--   entity_versions (source 'pages')   the snapshot's page data, and every page
--                                      row inside the snapshot's blocks
--   search_documents (source 'pages')  `metadata.icon` -> null
--
-- The callout's own `icon` is untouched: it stays a Material Symbols name.
--
-- "Not an emoji" is spelled as "printable ASCII only" (`~ '^[ -~]*$'`): every
-- symbol name is (kebab-case letters and digits), and no RGI emoji is — each
-- one holds a non-ASCII code point (a keycap `1️⃣` carries U+FE0F U+20E3). So an
-- emoji a user picks after this runs is never touched, and a second run changes
-- nothing: IDEMPOTENT.
--
-- `updated_at`: page_blocks' derived-updated-at trigger counts `data`, so each
-- page whose icon is cleared gets `updated_at = now()` and rises in Recent
-- pages. A DML-only migration (`data-migration-dml-only`) cannot disable the
-- trigger, and the trigger refuses a write to `updated_at` itself. Accepted, as
-- the 20260927 saved-icon remap accepted it: only pages that had an icon (a
-- small minority) move, and the rows are filtered so no other page is written.
--
-- ONE statement (data-modifying CTEs), DML only.

WITH cleared_blocks AS (
  UPDATE page_blocks b
  SET data = jsonb_set(b.data, '{icon}', 'null'::jsonb)
  WHERE b.type = 'page'
    AND jsonb_typeof(b.data) = 'object'
    AND jsonb_typeof(b.data -> 'icon') = 'string'
    AND (b.data ->> 'icon') ~ '^[ -~]*$'
  RETURNING 1
),
cleared_versions AS (
  UPDATE entity_versions ev
  SET snapshot = jsonb_set(
    jsonb_set(
      ev.snapshot,
      '{page}',
      CASE
        WHEN jsonb_typeof(ev.snapshot -> 'page' -> 'icon') = 'string'
          AND (ev.snapshot -> 'page' ->> 'icon') ~ '^[ -~]*$'
        THEN jsonb_set(ev.snapshot -> 'page', '{icon}', 'null'::jsonb)
        ELSE ev.snapshot -> 'page'
      END
    ),
    '{blocks}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN t.b ->> 'type' = 'page'
              AND jsonb_typeof(t.b -> 'data' -> 'icon') = 'string'
              AND (t.b -> 'data' ->> 'icon') ~ '^[ -~]*$'
            THEN jsonb_set(t.b, '{data,icon}', 'null'::jsonb)
            ELSE t.b
          END
          ORDER BY t.ord
        )
        FROM jsonb_array_elements(ev.snapshot -> 'blocks') WITH ORDINALITY AS t(b, ord)
      ),
      '[]'::jsonb
    )
  )
  WHERE ev.source_id = 'pages'
    AND jsonb_typeof(ev.snapshot -> 'page') = 'object'
    AND jsonb_typeof(ev.snapshot -> 'blocks') = 'array'
    AND (
      (
        jsonb_typeof(ev.snapshot -> 'page' -> 'icon') = 'string'
        AND (ev.snapshot -> 'page' ->> 'icon') ~ '^[ -~]*$'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(ev.snapshot -> 'blocks') AS e(b)
        WHERE e.b ->> 'type' = 'page'
          AND jsonb_typeof(e.b -> 'data' -> 'icon') = 'string'
          AND (e.b -> 'data' ->> 'icon') ~ '^[ -~]*$'
      )
    )
  RETURNING 1
),
cleared_search AS (
  UPDATE search_documents
  SET metadata = jsonb_set(metadata, '{icon}', 'null'::jsonb)
  WHERE source = 'pages'
    AND jsonb_typeof(metadata -> 'icon') = 'string'
    AND (metadata ->> 'icon') ~ '^[ -~]*$'
  RETURNING 1
)
SELECT 1;
