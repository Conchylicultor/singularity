DROP VIEW "public"."attempts_v";--> statement-breakpoint
DROP VIEW "public"."conversations_v";--> statement-breakpoint
CREATE VIEW "public"."attempts_v" AS (with "attempt_facts" as (select "id", EXISTS (
          SELECT 1 FROM "conversations" c WHERE c.attempt_id = "attempts"."id"
        ) as "has_conv", EXISTS (
          SELECT 1 FROM "conversations" c
           WHERE c.attempt_id = "attempts"."id" AND c.status NOT IN ('gone', 'done')
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
CREATE VIEW "public"."conversations_v" AS (select "conversations"."id", "conversations"."attempt_id", "conversations"."title", "conversations"."status", "conversations"."runtime", "conversations"."model", "conversations"."kind", "conversations"."claude_session_id", "conversations"."waiting_for", "conversations"."spawned_by", "conversations"."created_at", "conversations"."updated_at", "conversations"."ended_at", "attempts"."worktree_path", "attempts"."task_id", ("conversations"."status" <> 'done') as "active" from "conversations" inner join "attempts" on "attempts"."id" = "conversations"."attempt_id");--> statement-breakpoint
UPDATE "conversations" SET "status" = 'done' WHERE "status" = 'gone';