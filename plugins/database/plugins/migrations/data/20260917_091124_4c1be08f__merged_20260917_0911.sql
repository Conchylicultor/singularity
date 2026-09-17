CREATE TABLE IF NOT EXISTS "analytics_daily" (
	"day" date NOT NULL,
	"filter_dim" text NOT NULL,
	"filter_value" text NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"visitors" integer NOT NULL,
	"visits" integer NOT NULL,
	"pageviews" integer NOT NULL,
	"bounces" integer NOT NULL,
	"duration_ms" bigint NOT NULL,
	"events" integer NOT NULL,
	CONSTRAINT "analytics_daily_day_filter_dim_filter_value_dimension_value_pk" PRIMARY KEY("day","filter_dim","filter_value","dimension","value")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"event_name" text,
	"event_props" jsonb,
	"engaged_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_hash" text NOT NULL,
	"day" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"host" text NOT NULL,
	"entry_path" text NOT NULL,
	"exit_path" text NOT NULL,
	"exit_at" timestamp with time zone NOT NULL,
	"exit_pageview_id" uuid,
	"exit_engaged_ms" integer DEFAULT 0 NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	"engaged_ms" bigint DEFAULT 0 NOT NULL,
	"referrer_host" text,
	"referrer_path" text,
	"channel" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"language" text,
	"device" text NOT NULL,
	"browser" text NOT NULL,
	"os" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_hits" ADD CONSTRAINT "analytics_hits_visit_id_analytics_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."analytics_visits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_daily_level_idx" ON "analytics_daily" USING btree ("filter_dim","filter_value","dimension","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_hits_visit_idx" ON "analytics_hits" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visits_hash_last_at_idx" ON "analytics_visits" USING btree ("visitor_hash","last_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visits_day_idx" ON "analytics_visits" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visits_started_at_idx" ON "analytics_visits" USING btree ("started_at");