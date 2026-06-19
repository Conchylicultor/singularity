-- Custom SQL migration file, put your code below! --
-- migration: 20260619_124324__purge_malformed_worktree_attempts --

-- Purge synthesized holder-task subtrees whose attempts have a NON-CANONICAL
-- worktree_path. A real agent worktree always lives at
-- `<repoRoot>/.claude/worktrees/<id>` (built by worktreePathFor); any path
-- without `/.claude/worktrees/` in it — the main repo root, a /tmp path — is not
-- a worktree this system created.
--
-- These rows came from the poller's orphan-adoption path (adoptOrphanConversation)
-- adopting stray tmux `claude` sessions started OUTSIDE a worktree (manual /tmp
-- test runs, sessions launched from the repo root), plus two pre-`att-<seconds>`
-- legacy rows (attempt-system-batch, a 13-digit-ms `att-` id). They have no live
-- worktree dir and no `att-…` fork DB, so the worktree-cleanup reaper can never
-- act on them — they only clutter the cleanup list forever.
--
-- The structural hole is now closed: adoptOrphanConversation refuses to adopt a
-- non-canonical worktree, and isCanonicalWorktreePath is a single source of truth
-- in infra/worktree. So this backfill only reconciles pre-existing residue.
--
-- Deletes the whole holder subtree (task -> attempt -> conversations, pushes, and
-- ext side-tables all cascade via FK ON DELETE CASCADE). Scoped to:
--   (a) tasks that own at least one non-canonical attempt,
--   (b) AND own NO canonical attempt (so a task with a real attempt is untouched),
--   (c) AND have no child tasks (so a real folder is never cascade-removed).
-- Idempotent + self-validating: once clean, the predicate matches nothing, so
-- re-running it — and every worktree fork applying it on next boot — is a no-op.
DELETE FROM "tasks" t
WHERE EXISTS (
  SELECT 1 FROM "attempts" a
  WHERE a."task_id" = t."id"
    AND a."worktree_path" NOT LIKE '%/.claude/worktrees/%'
)
AND NOT EXISTS (
  SELECT 1 FROM "attempts" a2
  WHERE a2."task_id" = t."id"
    AND a2."worktree_path" LIKE '%/.claude/worktrees/%'
)
AND NOT EXISTS (
  SELECT 1 FROM "tasks" c WHERE c."folder_id" = t."id"
);
