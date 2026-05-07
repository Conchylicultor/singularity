DROP VIEW "public"."agents_v";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "auto_launch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "description", "prompt", "model", "icon", "icon_color", "expanded", "auto_launch", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");