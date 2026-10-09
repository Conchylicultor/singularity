-- Custom SQL migration file, put your code below! --
-- migration: 20261009_120004__rewrite_event_run_ids --

-- Phase 4 of the unified prefixed ids (`plugins/ids`,
-- research/2026-10-07-global-unified-prefixed-ids.md §4): rows minted as BARE
-- uuids get their kind's prefix — `<uuid>` → `<prefix>-<uuid>`, which the
-- kind's generic recognition body accepts, and which its `legacyBareUuid`
-- `key` / `parse` upgrade an old bare-uuid URL to.
--
-- IDEMPOTENT and FORK-SAFE: every statement touches only values that are still
-- a bare uuid (`~ '^<uuid>$'`), so a re-run, or a worktree fork taken after
-- main applied this, is a no-op — and hand-made ids (`seed-…`) are never
-- touched. Child FK columns follow through ON UPDATE CASCADE (phase 3, already
-- on main); soft refs (no FK) are rewritten explicitly below.

-- Soft ref (no FK): a source run's model calls carry the run id as their
-- correlation id (`url-extract` stamps `ctx.runId`), and the run pane's
-- model-call section reads them back by it. Matched by the calling source
-- rather than by a join, so calls whose run was already swept by retention
-- are rewritten too.
UPDATE claude_cli_calls SET correlation_id = 'evrun-' || correlation_id
  WHERE source_name LIKE 'events.%' AND correlation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- The runs: cascades to `event_source_run_events.run_id`.
UPDATE event_source_runs SET id = 'evrun-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
