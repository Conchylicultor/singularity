DROP VIEW "public"."attempts_v";--> statement-breakpoint
CREATE VIEW "public"."attempts_v" AS (with "conv_agg" as (select "attempt_id", true as "has_conv", bool_or("status" NOT IN ('gone', 'done')) as "has_live_conv", max("ended_at") as "max_ended_at" from "conversations" group by "conversations"."attempt_id"), "push_agg" as (select "attempt_id", true as "has_push", min("created_at") as "min_push_at" from "pushes" group by "pushes"."attempt_id") select "attempts"."id", "attempts"."task_id", "attempts"."worktree_path", "attempts"."created_at", "attempts"."updated_at", 
    CASE
      WHEN "has_conv" IS NULL                              THEN 'pending'
      WHEN "has_live_conv" AND "has_push" IS NULL    THEN 'in_progress'
      WHEN "has_live_conv" AND "has_push"           THEN 'pushed'
      WHEN "has_push"                                       THEN 'completed'
      ELSE                                                               'abandoned'
    END
   as "status", ("has_conv" IS NULL OR "has_live_conv") as "active", 
        CASE
          WHEN "has_push" AND NOT COALESCE("has_live_conv", false)   THEN "min_push_at"
          WHEN "has_conv" AND NOT COALESCE("has_live_conv", false)
            AND "has_push" IS NULL                                          THEN "max_ended_at"
          ELSE                                                                           NULL
        END
       as "finished_at" from "attempts" left join "conv_agg" on "conv_agg"."attempt_id" = "attempts"."id" left join "push_agg" on "push_agg"."attempt_id" = "attempts"."id");