CREATE TABLE IF NOT EXISTS "yak_shaving_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_category_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"rank" "rank_text",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yak_shaving_nodes" ADD COLUMN "parent_category_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yak_shaving_categories_parent_idx" ON "yak_shaving_categories" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yak_shaving_nodes_parent_cat_idx" ON "yak_shaving_nodes" USING btree ("parent_category_id");