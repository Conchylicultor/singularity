CREATE TABLE IF NOT EXISTS "conversation_category_colors" (
	"category" text PRIMARY KEY NOT NULL,
	"color_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
