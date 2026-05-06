DROP VIEW "public"."agents_v";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "prompt", "model", "icon", "icon_color", "expanded", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");