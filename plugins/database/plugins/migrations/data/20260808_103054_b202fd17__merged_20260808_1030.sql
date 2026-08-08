CREATE TABLE IF NOT EXISTS "event_source_run_events" (
	"run_id" text NOT NULL,
	"event_id" text NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "event_source_run_events_run_id_event_id_pk" PRIMARY KEY("run_id","event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_source_run_events" ADD CONSTRAINT "event_source_run_events_run_id_event_source_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."event_source_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_source_run_events" ADD CONSTRAINT "event_source_run_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_source_run_events_event_idx" ON "event_source_run_events" USING btree ("event_id");