DROP VIEW "public"."agents_v";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "icon_color" text;--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "description", "prompt", "model", "icon", "icon_color", "expanded", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");