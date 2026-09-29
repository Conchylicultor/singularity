-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "op_log_ingest_cursor" (
	"source" text PRIMARY KEY NOT NULL,
	"inode" text NOT NULL,
	"offset" bigint NOT NULL,
	"gap_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "op_log_ops" (
	"op_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"op_slug" text,
	"branch" text NOT NULL,
	"conversation_id" text,
	"lane" text,
	"mode" text,
	"build_id" text,
	"pid" integer,
	"requested_at" timestamp with time zone NOT NULL,
	"granted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"interrupted" boolean DEFAULT false NOT NULL,
	"closed_by" text,
	"waits" jsonb NOT NULL,
	"open_wait" jsonb,
	"cycle" integer DEFAULT 0 NOT NULL,
	"closed_wait_ms" double precision DEFAULT 0 NOT NULL,
	"hold_ms" double precision DEFAULT 0 NOT NULL,
	"total_ms" double precision DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "op_log_ops_requested_idx" ON "op_log_ops" USING btree ("requested_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "op_log_ops_slug_requested_idx" ON "op_log_ops" USING btree ("op_slug","requested_at");
CREATE INDEX IF NOT EXISTS "op_log_ops_kind_requested_idx" ON "op_log_ops" USING btree ("kind","requested_at");
CREATE INDEX IF NOT EXISTS "op_log_ops_in_flight_idx" ON "op_log_ops" USING btree ("requested_at") WHERE "op_log_ops"."closed_by" IS NULL;
-- singularity:phase contract
-- singularity:claims
