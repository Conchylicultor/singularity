-- ------------------------------------------------------------------
-- Step 1 — introduce new structure (nullable where data-migration needed).
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"worktree_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Drop the pre-existing FKs that pointed at old names so we can mutate FK
-- columns safely below.
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_task_attempt_id_task_attempts_id_fk";--> statement-breakpoint
ALTER TABLE "pushes" DROP CONSTRAINT IF EXISTS "pushes_conversation_id_conversations_id_fk";--> statement-breakpoint

-- pushes.conversation_id becomes a soft-attribution column (no FK).
ALTER TABLE "pushes" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint

-- New nullable columns, filled in by the data migration below.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "attempt_id" text;--> statement-breakpoint
ALTER TABLE "pushes" ADD COLUMN IF NOT EXISTS "attempt_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "dropped_at" timestamp with time zone;--> statement-breakpoint

-- ------------------------------------------------------------------
-- Step 2 — data migration (hand-written).
-- ------------------------------------------------------------------

-- 2a. Carry forward existing task_attempts rows into the new attempts table.
--     Backfill worktree_path from the (1:1) conversation that owns them.
INSERT INTO "attempts" (id, task_id, worktree_path, created_at, updated_at)
SELECT ta.id,
       ta.task_id,
       COALESCE(
         (SELECT c.worktree_path
            FROM "conversations" c
           WHERE c.task_attempt_id = ta.id
           LIMIT 1),
         ''
       ),
       ta.created_at,
       ta.updated_at
  FROM "task_attempts" ta
 ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2b. Orphan conversations (no task_attempt_id yet): synthesise a placeholder
--     task + attempt. The attempt id equals the conversation id so the
--     <id>.localhost:9000 subdomain keeps routing.
INSERT INTO "tasks" (id, title, expanded, created_at, updated_at)
SELECT 'legacy-' || c.id,
       COALESCE(c.title, 'Untitled conversation'),
       false,
       c.created_at,
       c.updated_at
  FROM "conversations" c
 WHERE c.task_attempt_id IS NULL
 ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

INSERT INTO "attempts" (id, task_id, worktree_path, created_at, updated_at)
SELECT c.id,
       'legacy-' || c.id,
       c.worktree_path,
       c.created_at,
       c.updated_at
  FROM "conversations" c
 WHERE c.task_attempt_id IS NULL
 ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2c. Point every conversation at its attempt.
UPDATE "conversations"
   SET "attempt_id" = COALESCE("task_attempt_id", "id")
 WHERE "attempt_id" IS NULL;
--> statement-breakpoint

-- 2d. Collapse the old 6-value conversation status into the new 4-value
--     vocabulary. Legacy rows that were "completed" without a matching push
--     will derive as "abandoned" at the attempt level — acceptable fidelity
--     loss for pre-v2 history.
UPDATE "conversations" SET "status" = CASE "status"
    WHEN 'starting'         THEN 'starting'
    WHEN 'working'          THEN 'working'
    WHEN 'needs_attention'  THEN 'waiting'
    WHEN 'completed'        THEN 'gone'
    WHEN 'gone'             THEN 'gone'
    WHEN 'abandoned'        THEN 'gone'
    ELSE "status"
  END;
--> statement-breakpoint

-- 2e. Re-key pushes via the conversation they point to.
UPDATE "pushes" p
   SET "attempt_id" = c."attempt_id"
  FROM "conversations" c
 WHERE p."conversation_id" = c."id"
   AND p."attempt_id" IS NULL;
--> statement-breakpoint

-- 2f. Backfill worktree_path on attempts that still have it NULL (e.g. a
--     pre-existing task_attempts row whose conversation was deleted before
--     this migration ran). Use an empty string as a benign placeholder.
UPDATE "attempts" SET "worktree_path" = '' WHERE "worktree_path" IS NULL;
--> statement-breakpoint

-- Orphan any push rows whose conversation_id has no matching attempt (rows
-- written by an older backfill where the conversation has since been
-- deleted). They can't be carried forward and the FK below would reject them.
DELETE FROM "pushes" WHERE "attempt_id" IS NULL;
--> statement-breakpoint

-- ------------------------------------------------------------------
-- Step 3 — lock down the model.
-- ------------------------------------------------------------------

ALTER TABLE "attempts"     ALTER COLUMN "worktree_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "attempt_id"  SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pushes"        ALTER COLUMN "attempt_id"  SET NOT NULL;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pushes" ADD CONSTRAINT "pushes_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pushes_attempt_id_idx" ON "pushes" USING btree ("attempt_id");--> statement-breakpoint

-- Drop the now-dead columns / table.
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "worktree_path";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "task_attempt_id";--> statement-breakpoint
ALTER TABLE "tasks"         DROP COLUMN IF EXISTS "status";--> statement-breakpoint
DROP TABLE IF EXISTS "task_attempts" CASCADE;--> statement-breakpoint

-- ------------------------------------------------------------------
-- Step 4 — public views.
-- ------------------------------------------------------------------

CREATE VIEW "public"."conversations_v" AS (
  select "conversations"."id", "conversations"."attempt_id", "conversations"."title", "conversations"."status", "conversations"."runtime", "conversations"."claude_session_id", "conversations"."created_at", "conversations"."updated_at", "conversations"."ended_at", "attempts"."worktree_path", ("conversations"."status" <> 'gone') as "active"
    from "conversations"
    inner join "attempts" on "attempts"."id" = "conversations"."attempt_id"
);
--> statement-breakpoint

CREATE VIEW "public"."attempts_v" AS (
  with "attempt_facts" as (
    select "attempts"."id" as "id",
      EXISTS (
        SELECT 1 FROM conversations c WHERE c.attempt_id = "attempts"."id"
      ) as "has_conv",
      EXISTS (
        SELECT 1 FROM conversations c
         WHERE c.attempt_id = "attempts"."id" AND c.status <> 'gone'
      ) as "has_live_conv",
      EXISTS (
        SELECT 1 FROM "pushes" p WHERE p.attempt_id = "attempts"."id"
      ) as "has_push",
      (SELECT MIN(p.created_at) FROM "pushes" p WHERE p.attempt_id = "attempts"."id") as "min_push_at",
      (SELECT MAX(c.ended_at) FROM conversations c WHERE c.attempt_id = "attempts"."id") as "max_ended_at"
    from "attempts"
  )
  select "attempts"."id", "attempts"."task_id", "attempts"."worktree_path", "attempts"."created_at", "attempts"."updated_at",
    CASE
      WHEN NOT "has_conv"                                       THEN 'pending'
      WHEN "has_live_conv" AND NOT "has_push"               THEN 'in_progress'
      WHEN "has_live_conv" AND "has_push"                   THEN 'pushed'
      WHEN "has_push"                                            THEN 'completed'
      ELSE                                                                  'abandoned'
    END as "status",
    ((NOT "has_conv") OR "has_live_conv") as "active",
    CASE
      WHEN "has_push" AND NOT "has_live_conv"               THEN "min_push_at"
      WHEN "has_conv" AND NOT "has_live_conv"
        AND NOT "has_push"                                       THEN "max_ended_at"
      ELSE                                                                  NULL
    END as "finished_at"
  from "attempts"
  inner join "attempt_facts" on "attempt_facts"."id" = "attempts"."id"
);
--> statement-breakpoint

CREATE VIEW "public"."tasks_v" AS (
  with "task_facts" as (
    select "tasks"."id" as "id",
      EXISTS (
        SELECT 1 FROM "attempts" a WHERE a.task_id = "tasks"."id"
      ) as "has_attempt",
      EXISTS (
        SELECT 1 FROM attempts_v a
         WHERE a.task_id = "tasks"."id" AND a.status = 'completed'
      ) as "has_completed",
      EXISTS (
        SELECT 1 FROM attempts_v a
         WHERE a.task_id = "tasks"."id" AND a.active
      ) as "has_active",
      (
        SELECT MIN(p.created_at)
          FROM "pushes" p
          JOIN "attempts" a ON a.id = p.attempt_id
         WHERE a.task_id = "tasks"."id"
      ) as "min_completed_push_at"
    from "tasks"
  )
  select "tasks"."id", "tasks"."parent_id", "tasks"."title", "tasks"."description", "tasks"."dropped_at", "tasks"."expanded", "tasks"."created_at", "tasks"."updated_at",
    CASE
      WHEN "tasks"."dropped_at" IS NOT NULL   THEN 'dropped'
      WHEN "has_completed"             THEN 'done'
      WHEN "has_active"                THEN 'in_progress'
      WHEN "has_attempt"               THEN 'attempted'
      ELSE                                        'new'
    END as "status",
    (
      "tasks"."dropped_at" IS NULL
      AND NOT "has_completed"
      AND "has_active"
    ) as "active",
    CASE
      WHEN "tasks"."dropped_at" IS NOT NULL   THEN "tasks"."dropped_at"
      WHEN "has_completed"             THEN "min_completed_push_at"
      ELSE                                        NULL
    END as "finished_at"
  from "tasks"
  inner join "task_facts" on "task_facts"."id" = "tasks"."id"
);
