-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "sonata_songs_ext_ug_alignment" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"video_id" text,
	"status" text NOT NULL,
	"phase" text,
	"error" text,
	"error_permanent" boolean NOT NULL,
	"record" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "sonata_ug_tabSaved_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"song_id" text
);
CREATE INDEX IF NOT EXISTS "sonata_ug_tabSaved_triggers_songId_idx" ON "sonata_ug_tabSaved_triggers" USING btree ("song_id") WHERE enabled;
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_ug_alignment" ADD CONSTRAINT "sonata_songs_ext_ug_alignment_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
