-- Custom SQL migration file, put your code below! --
-- migration: 20260618_182108__reparent_container_task_attempts --

-- Reconcile pre-guard residue: attempts that were attached DIRECTLY to system
-- meta/container folder tasks. Container tasks are folders and must never own an
-- attempt (now enforced by assertNotContainerTask), but attempts created before
-- that guard remain attached — which makes tasks_v derive the folder's status
-- from that phantom attempt instead of leaving it a clean folder (e.g.
-- task-meta-system showed a derived status from attempt-system-batch).
--
-- Fix (non-destructive, structurally correct): interpose a real leaf task
-- between the folder and the attempt, restoring the data-model invariant
-- folder -> child task -> attempt -> conversation. The conversation history is
-- preserved, and the container folder reverts to rendering like every other
-- clean folder (no direct attempt of its own).
--
-- Idempotent: the INSERT is ON CONFLICT DO NOTHING and the UPDATE only ever
-- matches attempts still attached to a container task, so re-running is a no-op.
-- Runs once per DB via the runner's filename-hash tracking; it reconciles the
-- main DB and every worktree fork (each applies it on its next boot).

-- 1. Create one recovered holder child task per offending attempt, under the
--    container it was wrongly attached to. The id is derived from the attempt id
--    so it is deterministic and stable across the main DB and all forks. Rank is
--    distinct per container (sorts after real children) and title_auto=false so
--    the async title generator never rewrites the recovery label.
INSERT INTO "tasks" (
  "id", "folder_id", "title", "title_auto", "rank", "author", "created_at", "updated_at"
)
SELECT
  'task-reparented-' || a."id",
  a."task_id",
  'Recovered conversations',
  false,
  'm' || ROW_NUMBER() OVER (PARTITION BY a."task_id" ORDER BY a."created_at", a."id"),
  'system',
  a."created_at",
  a."created_at"
FROM "attempts" a
WHERE a."task_id" IN (
  'task-meta-conversations',
  'task-meta-system',
  'task-meta-agents',
  'task-meta-improvements',
  'task-meta-reports'
)
ON CONFLICT ("id") DO NOTHING;

-- 2. Move each offending attempt onto its recovered holder task.
UPDATE "attempts"
SET "task_id" = 'task-reparented-' || "id",
    "updated_at" = now()
WHERE "task_id" IN (
  'task-meta-conversations',
  'task-meta-system',
  'task-meta-agents',
  'task-meta-improvements',
  'task-meta-reports'
);

-- 3. Clear stale dropped_at / held_at on container/meta folder tasks. A container
--    task is a folder and must never be dropped or held — these flags are residue
--    from the same original bug: an attempt lived on the folder, and dropping that
--    attempt's conversation cascaded a drop onto the folder row itself (e.g.
--    task-meta-system was stamped dropped_at right after its orphaned attempt was
--    abandoned). That flag was masked while the phantom completed attempt made
--    tasks_v report 'done'; once step 2 detaches the attempt it would otherwise
--    resurface as 'dropped'. Clearing it returns the folder to the clean 'new'
--    state shared by every other meta folder. Idempotent: only matches set flags.
UPDATE "tasks"
SET "dropped_at" = NULL, "held_at" = NULL, "updated_at" = now()
WHERE "id" IN (
  'task-meta-conversations',
  'task-meta-system',
  'task-meta-agents',
  'task-meta-improvements',
  'task-meta-reports'
)
AND ("dropped_at" IS NOT NULL OR "held_at" IS NOT NULL);
