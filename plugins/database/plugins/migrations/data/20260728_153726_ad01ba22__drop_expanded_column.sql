DROP VIEW IF EXISTS "public"."tasks_v";--> statement-breakpoint
DROP VIEW IF EXISTS "public"."agents_v";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN IF EXISTS "expanded";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "expanded";
