CREATE TABLE IF NOT EXISTS "staged_config_default" (
	"plugin_id" text NOT NULL,
	"config_name" text NOT NULL,
	"value" jsonb NOT NULL,
	"author_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staged_config_default_plugin_id_config_name_pk" PRIMARY KEY("plugin_id","config_name")
);
--> statement-breakpoint
DROP TABLE "reorder_staged_default" CASCADE;