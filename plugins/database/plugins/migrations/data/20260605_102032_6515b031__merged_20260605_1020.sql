CREATE TABLE IF NOT EXISTS "tasks_ext_preprompt" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"preprompt_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_ext_preprompt" ADD CONSTRAINT "tasks_ext_preprompt_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
