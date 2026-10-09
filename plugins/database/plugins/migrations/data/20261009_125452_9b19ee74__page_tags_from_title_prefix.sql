-- page_tags_from_title_prefix: a live page's hand-written status prefix
-- ("[In progress] Cold start") becomes a tag (plugins/page/plugins/tags).
--
-- For every live page row whose title opens with "[Name] ":
--   1. the vocabulary gets a tag for Name (by its normalized key — trimmed,
--      inner whitespace collapsed, lower-cased: `tagKey`);
--   2. the page carries that tag (appended, never twice);
--   3. the prefix is stripped from the title.
-- Idempotent by its WHERE: only titles still carrying a prefix are read, and
-- step 3 is what makes a page stop matching. Ids are `tag-<epochSeconds>-<6>`,
-- the stamped shape `pageTagIdKind` recognises.

INSERT INTO page_tags (id, name, name_key, color)
SELECT
  'tag-' || extract(epoch FROM now())::bigint || '-' || substr(md5(p.name_key), 1, 6),
  p.name,
  p.name_key,
  CASE p.name_key
    WHEN 'in progress' THEN 'blue'
    WHEN 'planned' THEN 'purple'
    WHEN 'done' THEN 'green'
    WHEN 'parked' THEN 'yellow'
    ELSE 'gray'
  END
FROM (
  SELECT DISTINCT ON (name_key) name, name_key
  FROM (
    SELECT
      regexp_replace(btrim(substring(data->>'title' FROM '^\s*\[([^\]]+)\]')), '\s+', ' ', 'g') AS name,
      lower(regexp_replace(btrim(substring(data->>'title' FROM '^\s*\[([^\]]+)\]')), '\s+', ' ', 'g')) AS name_key,
      created_at
    FROM page_blocks
    WHERE type = 'page'
      AND deleted_at IS NULL
      AND data->>'title' ~ '^\s*\[[^\]]+\]'
  ) named
  WHERE name <> ''
  ORDER BY name_key, created_at
) p
-- Not ON CONFLICT: the unique index on name_key is created in the claiming
-- schema migration's CONTRACT phase, after this runs.
WHERE NOT EXISTS (SELECT 1 FROM page_tags t WHERE t.name_key = p.name_key);

INSERT INTO page_blocks_ext_tags (parent_id, tag_ids)
SELECT b.id, jsonb_build_array(t.id)
FROM page_blocks b
JOIN page_tags t
  ON t.name_key = lower(regexp_replace(btrim(substring(b.data->>'title' FROM '^\s*\[([^\]]+)\]')), '\s+', ' ', 'g'))
WHERE b.type = 'page'
  AND b.deleted_at IS NULL
  AND b.data->>'title' ~ '^\s*\[[^\]]+\]'
ON CONFLICT (parent_id) DO UPDATE
SET tag_ids = CASE
  WHEN page_blocks_ext_tags.tag_ids @> EXCLUDED.tag_ids THEN page_blocks_ext_tags.tag_ids
  ELSE page_blocks_ext_tags.tag_ids || EXCLUDED.tag_ids
END;

UPDATE page_blocks
SET data = jsonb_set(
  data,
  '{title}',
  to_jsonb(regexp_replace(data->>'title', '^\s*\[[^\]]+\]\s*', ''))
)
WHERE type = 'page'
  AND deleted_at IS NULL
  AND data->>'title' ~ '^\s*\[[^\]]+\]'
  AND btrim(substring(data->>'title' FROM '^\s*\[([^\]]+)\]')) <> '';
