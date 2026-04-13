CREATE TABLE IF NOT EXISTS "smoketest" (
	"id" text PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
