DROP VIEW "public"."tasks_v";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rank" text;--> statement-breakpoint
UPDATE "tasks" t
SET "rank" = 'c' || LPAD(TO_HEX(rn::int), 3, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY created_at, id) AS rn
  FROM "tasks"
) s
WHERE t.id = s.id AND t."rank" IS NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "rank" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_parent_rank_idx" ON "tasks" USING btree ("parent_id","rank");--> statement-breakpoint
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
        ) as "min_completed_push_at" from "tasks") select "tasks"."id", "tasks"."parent_id", "tasks"."title", "tasks"."description", "tasks"."dropped_at", "tasks"."held_at", "tasks"."expanded", "tasks"."rank", "tasks"."created_at", "tasks"."updated_at",
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN 'dropped'
          WHEN "tasks"."held_at"    IS NOT NULL   THEN 'held'
          WHEN "has_completed"             THEN 'done'
          WHEN "has_active"                THEN 'in_progress'
          WHEN "has_attempt"               THEN 'attempted'
          ELSE                                        'new'
        END
       as "status", (
        "tasks"."dropped_at" IS NULL
        AND "tasks"."held_at" IS NULL
        AND NOT "has_completed"
        AND "has_active"
      ) as "active",
        CASE
          WHEN "tasks"."dropped_at" IS NOT NULL   THEN "tasks"."dropped_at"
          WHEN "has_completed"             THEN "min_completed_push_at"
          ELSE                                        NULL
        END
       as "finished_at" from "tasks" inner join "task_facts" on "task_facts"."id" = "tasks"."id");
