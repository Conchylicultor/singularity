DROP TABLE "queue_state" CASCADE;--> statement-breakpoint
ALTER TABLE "conversations_ext_queue" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;