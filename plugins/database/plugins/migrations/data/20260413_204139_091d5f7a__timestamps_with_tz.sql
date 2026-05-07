ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pushes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;