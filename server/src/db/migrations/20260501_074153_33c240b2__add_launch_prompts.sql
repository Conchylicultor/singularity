CREATE TABLE IF NOT EXISTS "launch_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "launch_prompts_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_prompts_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "launch_prompts_attachments" ADD CONSTRAINT "launch_prompts_attachments_owner_id_launch_prompts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."launch_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "launch_prompts_attachments" ADD CONSTRAINT "launch_prompts_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
