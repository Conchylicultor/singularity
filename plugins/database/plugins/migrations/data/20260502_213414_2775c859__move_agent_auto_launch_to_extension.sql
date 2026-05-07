CREATE TABLE IF NOT EXISTS "agents_ext_auto_launch" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."agents_v";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents_ext_auto_launch" ADD CONSTRAINT "agents_ext_auto_launch_parent_id_agents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN IF EXISTS "auto_launch";--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "description", "prompt", "model", "icon", "icon_color", "expanded", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");