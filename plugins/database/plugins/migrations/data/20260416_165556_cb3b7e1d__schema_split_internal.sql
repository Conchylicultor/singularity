-- tasks_v depends on attempts_v, so drop it first. Drizzle-kit emits the
-- drops in declaration order, which is wrong here; manual swap.
DROP VIEW "public"."tasks_v";--> statement-breakpoint
DROP VIEW "public"."attempts_v";--> statement-breakpoint
CREATE VIEW "public"."attempts_v" AS (with "attempt_facts" as (select "id", EXISTS (
          SELECT 1 FROM "conversations" c WHERE c.attempt_id = "attempts"."id"
        ) as "has_conv", EXISTS (
          SELECT 1 FROM "conversations" c
           WHERE c.attempt_id = "attempts"."id" AND c.status <> 'gone'
        ) as "has_live_conv", EXISTS (
          SELECT 1 FROM "pushes" p WHERE p.attempt_id = "attempts"."id"
        ) as "has_push", (SELECT MIN(p.created_at) FROM "pushes" p WHERE p.attempt_id = "attempts"."id") as "min_push_at", (SELECT MAX(c.ended_at) FROM "conversations" c WHERE c.attempt_id = "attempts"."id") as "max_ended_at" from "attempts") select "attempts"."id", "attempts"."task_id", "attempts"."worktree_path", "attempts"."created_at", "attempts"."updated_at", 
        CASE
          WHEN NOT "has_conv"                                       THEN 'pending'
          WHEN "has_live_conv" AND NOT "has_push"               THEN 'in_progress'
          WHEN "has_live_conv" AND "has_push"                   THEN 'pushed'
          WHEN "has_push"                                            THEN 'completed'
          ELSE                                                                  'abandoned'
        END
       as "status", ((NOT "has_conv") OR "has_live_conv") as "active", 
        CASE
          WHEN "has_push" AND NOT "has_live_conv"               THEN "min_push_at"
          WHEN "has_conv" AND NOT "has_live_conv"
            AND NOT "has_push"                                       THEN "max_ended_at"
          ELSE                                                                  NULL
        END
       as "finished_at" from "attempts" inner join "attempt_facts" on "attempt_facts"."id" = "attempts"."id");--> statement-breakpoint
CREATE VIEW "public"."tasks_v" AS (with "task_facts" as (select "id", EXISTS (
          SELECT 1 FROM "attempts" a WHERE a.task_id = "tasks"."id"
        ) as "has_attempt", EXISTS (
          SELECT 1 FROM "attempts_v" a
           WHERE a.task_id = "tasks"."id" AND a.status = 'completed'
        ) as "has_completed", EXISTS (
          SELECT 1 FROM "attempts_v" a
           WHERE a.task_id = "tasks"."id" AND a.active
        ) as "has_active", (
          SELECT MIN(p.created_at)
            FROM "pushes" p
            JOIN "attempts" a ON a.id = p.attempt_id
           WHERE a.task_id = "tasks"."id"
        ) as "min_completed_push_at" from "tasks") select "tasks"."id", "tasks"."parent_id", "tasks"."title", "tasks"."description", "tasks"."dropped_at", "tasks"."expanded", "tasks"."created_at", "tasks"."updated_at", 
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN 'dropped'
          WHEN "has_completed"             THEN 'done'
          WHEN "has_active"                THEN 'in_progress'
          WHEN "has_attempt"               THEN 'attempted'
          ELSE                                        'new'
        END
       as "status", (
        "tasks"."dropped_at" IS NULL
        AND NOT "has_completed"
        AND "has_active"
      ) as "active", 
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN "tasks"."dropped_at"
          WHEN "has_completed"             THEN "min_completed_push_at"
          ELSE                                        NULL
        END
       as "finished_at" from "tasks" inner join "task_facts" on "task_facts"."id" = "tasks"."id");