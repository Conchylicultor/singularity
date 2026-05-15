-- Evolve workflows engine from linear step chain to DAG model.
-- No data exists in these tables so all changes are safe.
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "entry_step_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "steps" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" ADD COLUMN IF NOT EXISTS "execution_order" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" ADD COLUMN IF NOT EXISTS "next" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_steps" DROP COLUMN IF EXISTS "step_index";--> statement-breakpoint
DROP INDEX IF EXISTS "wf_exec_steps_exec_idx";--> statement-breakpoint
CREATE INDEX "wf_exec_steps_exec_idx" ON "workflow_execution_steps" USING btree ("execution_id","execution_order");
