ALTER TABLE "reports" ADD COLUMN "operation_kind" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "threshold_ms" integer;