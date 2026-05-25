CREATE TABLE IF NOT EXISTS "tweakcn_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"tweakcn_id" text NOT NULL,
	"label" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"presets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tweakcn_themes_tweakcn_id_unique" UNIQUE("tweakcn_id")
);
