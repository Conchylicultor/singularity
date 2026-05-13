DROP VIEW "public"."agents_v";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "icon_svg_nodes" text;--> statement-breakpoint
ALTER TABLE "conversation_category_colors" ADD COLUMN "icon_svg_nodes" text;--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "prompt", "model", "icon", "icon_color", "icon_svg_nodes", "expanded", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");