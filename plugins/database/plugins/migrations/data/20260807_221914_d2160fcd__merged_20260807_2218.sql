CREATE TABLE IF NOT EXISTS "page_blocks_ext_todo_task" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_todo_task" ADD CONSTRAINT "page_blocks_ext_todo_task_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_todo_task" ADD CONSTRAINT "page_blocks_ext_todo_task_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_ext_todo_task_task_idx" ON "page_blocks_ext_todo_task" USING btree ("task_id");