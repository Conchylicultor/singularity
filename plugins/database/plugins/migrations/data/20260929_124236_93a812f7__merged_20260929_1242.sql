CREATE TABLE IF NOT EXISTS "analytics_visit_members" (
	"visit_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visitor_id" text NOT NULL,
	"dim" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "analytics_visit_members_visit_id_dim_value_pk" PRIMARY KEY("visit_id","dim","value")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_visitor_links" (
	"day" date NOT NULL,
	"hash" text NOT NULL,
	"visitor_id" text NOT NULL,
	CONSTRAINT "analytics_visitor_links_day_hash_pk" PRIMARY KEY("day","hash")
);
--> statement-breakpoint
ALTER TABLE "analytics_visits" RENAME COLUMN "visitor_hash" TO "visitor_id";--> statement-breakpoint
DROP INDEX IF EXISTS "analytics_visits_hash_last_at_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visit_members_level_idx" ON "analytics_visit_members" USING btree ("dim","value","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visit_members_day_idx" ON "analytics_visit_members" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visits_visitor_last_at_idx" ON "analytics_visits" USING btree ("visitor_id","last_at");--> statement-breakpoint
ALTER TABLE "analytics_daily" DROP COLUMN IF EXISTS "visitors";