DROP VIEW "public"."tasks_v";--> statement-breakpoint
CREATE VIEW "public"."tasks_v" AS (with "conv_agg" as (select "attempt_id", true as "has_conv", bool_or("status" NOT IN ('gone', 'done')) as "has_live_conv", max("ended_at") as "max_ended_at" from "conversations" group by "conversations"."attempt_id"), "push_agg" as (select "attempt_id", true as "has_push", min("created_at") as "min_push_at" from "pushes" group by "pushes"."attempt_id"), "attempt_status" as (select "attempts"."task_id", 
    CASE
      WHEN "has_conv" IS NULL                              THEN 'pending'
      WHEN "has_live_conv" AND "has_push" IS NULL    THEN 'in_progress'
      WHEN "has_live_conv" AND "has_push"           THEN 'pushed'
      WHEN "has_push"                                       THEN 'completed'
      ELSE                                                               'abandoned'
    END
   as "status", ("has_conv" IS NULL OR "has_live_conv") as "active" from "attempts" left join "conv_agg" on "conv_agg"."attempt_id" = "attempts"."id" left join "push_agg" on "push_agg"."attempt_id" = "attempts"."id"), "task_attempt_agg" as (select "task_id", true as "has_attempt", bool_or("status" = 'completed') as "has_completed", bool_or("active") as "has_active" from "attempt_status" group by "attempt_status"."task_id"), "task_waiting" as (select "attempts"."task_id", true as "has_waiting" from "conversations" inner join "attempts" on "attempts"."id" = "conversations"."attempt_id" where "conversations"."status" = 'waiting' group by "attempts"."task_id"), "task_completed_push" as (select "attempts"."task_id", min("pushes"."created_at") as "min_completed_push_at" from "pushes" inner join "attempts" on "attempts"."id" = "pushes"."attempt_id" group by "attempts"."task_id"), "task_completed" as (select "tasks"."id", "tasks"."dropped_at", COALESCE("has_completed", false) as "has_completed" from "tasks" left join "task_attempt_agg" on "task_attempt_agg"."task_id" = "tasks"."id"), "task_blocking" as (select "task_dependencies"."task_id", bool_or("task_completed"."dropped_at" IS NULL AND NOT "has_completed") as "has_blocking_dep" from "task_dependencies" inner join "task_completed" on "task_completed"."id" = "task_dependencies"."depends_on_task_id" group by "task_dependencies"."task_id"), "task_deps" as (select "task_id", array_agg("depends_on_task_id" ORDER BY "created_at") as "dependencies" from "task_dependencies" group by "task_dependencies"."task_id") select "tasks"."id", "tasks"."folder_id", "tasks"."group_id", "tasks"."title", "tasks"."title_auto", "tasks"."description", "tasks"."author", "tasks"."dropped_at", "tasks"."held_at", "tasks"."expanded", "tasks"."rank", "tasks"."created_at", "tasks"."updated_at", 
        CASE
          WHEN COALESCE("has_completed", false)                  THEN 'done'
          WHEN COALESCE("has_active", false) AND COALESCE("has_blocking_dep", false)
                                                                            THEN 'blocked'
          WHEN COALESCE("has_active", false) AND COALESCE("has_waiting", false)
                                                                            THEN 'need_action'
          WHEN COALESCE("has_active", false)                     THEN 'in_progress'
          WHEN "tasks"."dropped_at" IS NOT NULL                              THEN 'dropped'
          WHEN "tasks"."held_at"    IS NOT NULL                              THEN 'held'
          WHEN COALESCE("has_blocking_dep", false)                  THEN 'blocked'
          WHEN COALESCE("has_attempt", false)                    THEN 'attempted'
          ELSE                                                                   'new'
        END
       as "status", (
        NOT COALESCE("has_completed", false)
        AND COALESCE("has_active", false)
      ) as "active", 
        CASE
          WHEN COALESCE("has_completed", false)   THEN "min_completed_push_at"
          WHEN "tasks"."dropped_at" IS NOT NULL               THEN "tasks"."dropped_at"
          ELSE                                                    NULL
        END
       as "finished_at", COALESCE("dependencies", ARRAY[]::text[]) as "dependencies" from "tasks" left join "task_attempt_agg" on "task_attempt_agg"."task_id" = "tasks"."id" left join "task_waiting" on "task_waiting"."task_id" = "tasks"."id" left join "task_completed_push" on "task_completed_push"."task_id" = "tasks"."id" left join "task_blocking" on "task_blocking"."task_id" = "tasks"."id" left join "task_deps" on "task_deps"."task_id" = "tasks"."id");