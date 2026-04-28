CREATE TABLE IF NOT EXISTS "tasks_statusChanged_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" text,
	"status" text
);
--> statement-breakpoint
DROP VIEW "public"."tasks_v";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "auto_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "auto_start_model" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_statusChanged_triggers_taskId_idx" ON "tasks_statusChanged_triggers" USING btree ("task_id") WHERE enabled;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_statusChanged_triggers_status_idx" ON "tasks_statusChanged_triggers" USING btree ("status") WHERE enabled;--> statement-breakpoint
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
        ) as "has_blocking_dep" from "tasks") select "tasks"."id", "tasks"."parent_id", "tasks"."title", "tasks"."description", "tasks"."author", "tasks"."dropped_at", "tasks"."held_at", "tasks"."expanded", "tasks"."rank", "tasks"."auto_start_at", "tasks"."auto_start_model", "tasks"."created_at", "tasks"."updated_at", 
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL              THEN 'dropped'
          WHEN "tasks"."held_at"    IS NOT NULL              THEN 'held'
          WHEN "has_completed"                        THEN 'done'
          WHEN "has_blocking_dep"                      THEN 'blocked'
          WHEN "has_active" AND "has_waiting"   THEN 'need_action'
          WHEN "has_active"                           THEN 'in_progress'
          WHEN "has_attempt"                          THEN 'attempted'
          ELSE                                                   'new'
        END
       as "status", (
        "tasks"."dropped_at" IS NULL
        AND "tasks"."held_at" IS NULL
        AND NOT "has_completed"
        AND NOT "has_blocking_dep"
        AND "has_active"
      ) as "active", 
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN "tasks"."dropped_at"
          WHEN "has_completed"             THEN "min_completed_push_at"
          ELSE                                        NULL
        END
       as "finished_at", COALESCE(ARRAY(
        SELECT td.depends_on_task_id FROM "task_dependencies" td
         WHERE td.task_id = "tasks"."id"
         ORDER BY td.created_at
      ), ARRAY[]::text[]) as "dependencies" from "tasks" inner join "task_facts" on "task_facts"."id" = "tasks"."id");