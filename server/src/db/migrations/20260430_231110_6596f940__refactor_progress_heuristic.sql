TRUNCATE TABLE "conversation_progress";
--> statement-breakpoint
ALTER TABLE "conversation_progress" DROP COLUMN IF EXISTS "message_id";