ALTER TABLE "conversations" ADD COLUMN "runtime" text DEFAULT 'tmux' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "claude_session_id" text;