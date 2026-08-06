CREATE TABLE IF NOT EXISTS "usage_stats" (
	"usage_key" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL
);
