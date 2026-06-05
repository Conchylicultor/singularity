-- Backfill claude_cli_calls rows written before the coarse-tier → versioned-id
-- flattening. Pre-2026-06-01 print calls stored the bare tier "haiku", which is
-- neither a registry id nor (until now) a legacy alias, so StoredModelSchema
-- degraded it to DEFAULT_MODEL ("opus-4-8") at read time and mislabeled genuine
-- Haiku calls as Opus in the claude-cli-calls debug pane. The conversation
-- model backfill (opus/sonnet) missed this table because "haiku" only ever
-- reached print-only call rows.
UPDATE "claude_cli_calls" SET "model" = 'haiku-4-5' WHERE "model" = 'haiku';
