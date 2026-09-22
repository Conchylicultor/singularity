-- Custom SQL migration file, put your code below! --
-- migration: 20260922_230958__model_family_choices --

-- Armed auto-start tasks become family choices: "opus" runs the newest Opus
-- when the task launches. Until now the pickers only offered specific
-- versions, so none of these rows is a deliberate pin.
UPDATE "tasks_ext_auto_start"
SET "auto_start_model" = split_part("auto_start_model", '-', 1)
WHERE split_part("auto_start_model", '-', 1) IN ('opus', 'sonnet', 'fable')
  AND "auto_start_model" LIKE '%-%';

-- A conversation row records what RAN, never a family. The 2026-06-01 backfill
-- mapped pre-versioning "opus" rows to opus-4-6; this one was written after it.
UPDATE "conversations" SET "model" = 'opus-4-6' WHERE "model" = 'opus';
UPDATE "conversations" SET "model" = 'sonnet-4-6' WHERE "model" = 'sonnet';
