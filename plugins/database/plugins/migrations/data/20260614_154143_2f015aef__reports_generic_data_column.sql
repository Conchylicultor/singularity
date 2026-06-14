ALTER TABLE "reports" RENAME COLUMN "crash_loop" TO "rate_limited";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "error_type";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "stack";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "component_stack";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "slot";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "label";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "operation_kind";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "operation";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "duration_ms";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "threshold_ms";