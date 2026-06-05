CREATE TABLE IF NOT EXISTS "sonata_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"composer" text,
	"midi_attachment_id" text NOT NULL,
	"duration_sec" double precision NOT NULL,
	"end_beat" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sonata_songs_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sonata_songs_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_attachments" ADD CONSTRAINT "sonata_songs_attachments_owner_id_sonata_songs_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_attachments" ADD CONSTRAINT "sonata_songs_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
