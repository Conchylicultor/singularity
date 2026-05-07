CREATE TABLE IF NOT EXISTS "conversations_ext_queue" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."conversations_v";--> statement-breakpoint
DROP INDEX IF EXISTS "conversations_status_rank_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_ext_queue" ADD CONSTRAINT "conversations_ext_queue_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "rank";--> statement-breakpoint
CREATE VIEW "public"."conversations_v" AS (select "conversations"."id", "conversations"."attempt_id", "conversations"."title", "conversations"."status", "conversations"."runtime", "conversations"."model", "conversations"."kind", "conversations"."claude_session_id", "conversations"."spawned_by", "conversations"."created_at", "conversations"."updated_at", "conversations"."ended_at", "attempts"."worktree_path", "attempts"."task_id", ("conversations"."status" <> 'gone') as "active" from "conversations" inner join "attempts" on "attempts"."id" = "conversations"."attempt_id");