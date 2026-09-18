CREATE TABLE IF NOT EXISTS "chord_videos" (
	"video_id" text PRIMARY KEY NOT NULL,
	"oembed_status" text,
	"oembed_code" integer,
	"oembed_checked_at" timestamp with time zone,
	"player_status" text,
	"player_code" integer,
	"player_checked_at" timestamp with time zone
);
