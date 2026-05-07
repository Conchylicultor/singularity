CREATE TABLE IF NOT EXISTS "improve_config" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_template" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
