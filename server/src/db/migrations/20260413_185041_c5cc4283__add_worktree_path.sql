ALTER TABLE "conversations" ADD COLUMN "worktree_path" text;
UPDATE "conversations" SET "worktree_path" = '/Users/admin/__A__/dev/singularity/.claude/worktrees/' || id WHERE "worktree_path" IS NULL;
ALTER TABLE "conversations" ALTER COLUMN "worktree_path" SET NOT NULL;
