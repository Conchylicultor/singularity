CREATE TABLE IF NOT EXISTS "latency_ledger_host_minute" (
	"minute_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"duress" boolean DEFAULT false NOT NULL,
	"max_decompressions_per_sec" double precision,
	"min_free_mem_mb" double precision,
	"max_load1" double precision,
	"slept_ms" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latency_ledger_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"route" text NOT NULL,
	"duration_ms" double precision NOT NULL,
	"hidden" boolean NOT NULL,
	"censored" boolean NOT NULL,
	"resource_count" integer NOT NULL,
	"last_resource_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latency_ledger_minute" (
	"metric" text NOT NULL,
	"minute_start" timestamp with time zone NOT NULL,
	"scheme" smallint NOT NULL,
	"counts" integer[] NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sum_ms" double precision DEFAULT 0 NOT NULL,
	"max_ms" double precision DEFAULT 0 NOT NULL,
	"censored" integer DEFAULT 0 NOT NULL,
	"excluded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "latency_ledger_minute_metric_minute_start_pk" PRIMARY KEY("metric","minute_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latency_ledger_thread_minute" (
	"minute_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"samples" integer NOT NULL,
	"period_ms" double precision,
	"owners" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "latency_ledger_interaction_at_idx" ON "latency_ledger_interaction" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "latency_ledger_minute_start_idx" ON "latency_ledger_minute" USING btree ("minute_start");