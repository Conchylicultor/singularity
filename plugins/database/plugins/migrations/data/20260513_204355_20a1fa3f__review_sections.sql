CREATE TABLE IF NOT EXISTS "review_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
