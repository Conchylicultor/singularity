CREATE TABLE IF NOT EXISTS "quick_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"rank" TEXT COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
