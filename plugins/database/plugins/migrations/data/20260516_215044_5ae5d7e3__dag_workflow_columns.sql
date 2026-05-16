DROP VIEW "public"."tasks_v";--> statement-breakpoint
DROP INDEX IF EXISTS "wf_exec_steps_exec_idx";--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "steps" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "entry_step_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" ADD COLUMN IF NOT EXISTS "execution_order" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" ADD COLUMN IF NOT EXISTS "next" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "group_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_tasks_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_group_id_idx" ON "tasks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wf_exec_steps_exec_idx" ON "workflow_execution_steps" USING btree ("execution_id","execution_order");--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" DROP COLUMN IF EXISTS "step_index";--> statement-breakpoint
CREATE VIEW "public"."tasks_v" AS (with "task_facts" as (select "id", EXISTS (
          SELECT 1 FROM "attempts" a WHERE a.task_id = "tasks"."id"
        ) as "has_attempt", EXISTS (
          SELECT 1 FROM "attempts_v" a
           WHERE a.task_id = "tasks"."id" AND a.status = 'completed'
        ) as "has_completed", EXISTS (
          SELECT 1 FROM "attempts_v" a
           WHERE a.task_id = "tasks"."id" AND a.active
        ) as "has_active", EXISTS (
          SELECT 1 FROM "conversations" c
            JOIN "attempts" a ON a.id = c.attempt_id
           WHERE a.task_id = "tasks"."id" AND c.status = 'waiting'
        ) as "has_waiting", (
          SELECT MIN(p.created_at)
            FROM "pushes" p
            JOIN "attempts" a ON a.id = p.attempt_id
           WHERE a.task_id = "tasks"."id"
        ) as "min_completed_push_at", EXISTS (
          SELECT 1 FROM "task_dependencies" td
            JOIN "tasks" dep ON dep.id = td.depends_on_task_id
           WHERE td.task_id = "tasks"."id"
             AND dep.dropped_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM "attempts_v" a
                WHERE a.task_id = dep.id AND a.status = 'completed'
             )
        ) as "has_blocking_dep" from "tasks") select "tasks"."id", "tasks"."parent_id", "tasks"."group_id", "tasks"."title", "tasks"."description", "tasks"."author", "tasks"."dropped_at", "tasks"."held_at", "tasks"."expanded", "tasks"."rank", "tasks"."created_at", "tasks"."updated_at", 
        CASE
          WHEN "has_completed"                        THEN 'done'
          WHEN "has_active" AND "has_blocking_dep"
                                                           THEN 'blocked'
          WHEN "has_active" AND "has_waiting"   THEN 'need_action'
          WHEN "has_active"                           THEN 'in_progress'
          WHEN "tasks"."dropped_at" IS NOT NULL              THEN 'dropped'
          WHEN "tasks"."held_at"    IS NOT NULL              THEN 'held'
          WHEN "has_blocking_dep"                      THEN 'blocked'
          WHEN "has_attempt"                          THEN 'attempted'
          ELSE                                                   'new'
        END
       as "status", (
        NOT "has_completed"
        AND "has_active"
      ) as "active", 
        CASE
          WHEN "has_completed"             THEN "min_completed_push_at"
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN "tasks"."dropped_at"
          ELSE                                        NULL
        END
       as "finished_at", COALESCE(ARRAY(
        SELECT td.depends_on_task_id FROM "task_dependencies" td
         WHERE td.task_id = "tasks"."id"
         ORDER BY td.created_at
      ), ARRAY[]::text[]) as "dependencies" from "tasks" inner join "task_facts" on "task_facts"."id" = "tasks"."id");