CREATE TABLE IF NOT EXISTS "chord_index_request" (
	"id" integer PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chord_index_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"done" integer,
	"total" integer,
	"windows" integer,
	"error" text,
	"snapshot_name" text NOT NULL,
	"scope" text NOT NULL,
	"derivation_version" integer NOT NULL,
	"skipped" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chord_loop_windows" (
	"section_id" text NOT NULL,
	"shape" text NOT NULL,
	"start_beat" double precision NOT NULL,
	"end_beat" double precision NOT NULL,
	"bars" integer NOT NULL,
	"beats_per_bar" double precision NOT NULL,
	"beat_unit" double precision NOT NULL,
	"key_tonic" text NOT NULL,
	"key_mode" text NOT NULL,
	"chord_tokens" text[] NOT NULL,
	"features" text[] NOT NULL,
	"chord_count" integer NOT NULL,
	"change_count" integer NOT NULL,
	"has_rest" boolean NOT NULL,
	"starts_on_change" boolean NOT NULL,
	CONSTRAINT "chord_loop_windows_section_id_shape_start_beat_pk" PRIMARY KEY("section_id","shape","start_beat")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chord_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"artist" text NOT NULL,
	"song" text NOT NULL,
	"section_name" text NOT NULL,
	"artist_slug" text NOT NULL,
	"song_slug" text NOT NULL,
	"video_id" text,
	"video_duration_seconds" double precision,
	"alignment" jsonb NOT NULL,
	"keys" jsonb NOT NULL,
	"meters" jsonb NOT NULL,
	"tempos" jsonb NOT NULL,
	"end_beat" double precision NOT NULL,
	"chords" jsonb NOT NULL,
	"unloopable_reason" text,
	"source_tags" text[] NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chord_loop_windows" ADD CONSTRAINT "chord_loop_windows_section_id_chord_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."chord_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_loop_windows_chord_tokens_gin" ON "chord_loop_windows" USING gin ("chord_tokens");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_loop_windows_features_gin" ON "chord_loop_windows" USING gin ("features");