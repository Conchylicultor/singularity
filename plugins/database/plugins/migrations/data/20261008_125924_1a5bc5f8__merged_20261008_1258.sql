-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "app_usage_daily" (
	"usage_key" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"app_id" text NOT NULL,
	"launches" integer DEFAULT 0 NOT NULL,
	"focused_ms" bigint DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp with time zone,
	"last_flushed_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- singularity:phase contract
-- singularity:claims
