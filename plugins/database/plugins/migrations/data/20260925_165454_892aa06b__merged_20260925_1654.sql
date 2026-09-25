ALTER TABLE "improve_config" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "improve_config" CASCADE;--> statement-breakpoint
ALTER TABLE "chord_index_state" ALTER COLUMN "updated_at" SET DEFAULT now();