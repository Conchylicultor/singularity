CREATE TABLE IF NOT EXISTS "plugin_health_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"axis" text NOT NULL,
	"commit_hash" text NOT NULL,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks_ext_health_review" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_ext_health_review" ADD CONSTRAINT "tasks_ext_health_review_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plugin_health_reviews_plugin_axis_idx" ON "plugin_health_reviews" USING btree ("plugin_id","axis");