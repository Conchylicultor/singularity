-- Custom SQL migration file, put your code below! --
-- migration: 20260819_134227__backfill_source_last_extraction --

-- Give every source that has already run its `last_outcome` /
-- `last_event_count`, from the run ledger that has held the answer all along.
--
-- Without this, a source that ran a hundred times before those columns existed
-- reads "Never run" in the sources list — and, worse, stays wrong: the columns
-- are written by a RUN, and a source whose page never moves again only ever
-- gets `unchanged` runs, which deliberately never write the count. So a
-- previously-scraped source with zero events would read `OK` forever. The facts
-- are already in `event_source_runs`; this copies them across once.
--
-- A separate push from the one that added the columns, and that is a rule, not
-- a preference: `push` re-stamps every branch-local SCHEMA migration at push
-- time while leaving data migrations at theirs, so a backfill can never be
-- ordered after an ADD COLUMN from its own branch. The columns are on main
-- before this file exists.
--
-- Idempotent twice over, because a data migration is re-applied whenever its
-- content changes: the `IS NULL` guards make a re-run a no-op, and — more
-- importantly — they make it impossible for a re-apply to overwrite a value a
-- real run has written since. This only ever fills a hole.
--
-- Sources whose runs have aged out of the ledger's 30-day retention keep NULL
-- and go on reading "Never run". That is the honest answer: we no longer hold a
-- record of what happened, and inventing an `ok` for them would be a guess.

-- The last run of any kind, which is what `last_outcome` means.
UPDATE event_sources s
SET last_outcome = last_run.outcome
FROM (
  SELECT DISTINCT ON (source_id) source_id, outcome
  FROM event_source_runs
  ORDER BY source_id, started_at DESC
) AS last_run
WHERE last_run.source_id = s.id
  AND s.last_outcome IS NULL;
--> statement-breakpoint

-- The last EXTRACTION's count, and only an extraction's — the same rule the
-- engine writes under (`finishExtracted` alone touches this column). An
-- `unchanged` or `failed` run never read the page, so it has no count to state,
-- and taking one from it would replace a true number with a zero.
UPDATE event_sources s
SET last_event_count = last_extraction.events_found
FROM (
  SELECT DISTINCT ON (source_id) source_id, events_found
  FROM event_source_runs
  WHERE outcome = 'extracted'
  ORDER BY source_id, started_at DESC
) AS last_extraction
WHERE last_extraction.source_id = s.id
  AND s.last_event_count IS NULL;
