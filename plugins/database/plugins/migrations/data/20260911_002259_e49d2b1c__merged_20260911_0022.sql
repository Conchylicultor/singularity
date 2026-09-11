CREATE TABLE IF NOT EXISTS "saved_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"label" text NOT NULL,
	"extends" text,
	"fragments" jsonb NOT NULL,
	"color_adjust" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "tweakcn_themes" CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_themes_external_id_uniq" ON "saved_themes" USING btree ("external_id") WHERE "saved_themes"."external_id" IS NOT NULL;