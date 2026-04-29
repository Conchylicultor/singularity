CREATE TABLE IF NOT EXISTS "agents_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quick_prompts_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_prompts_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents_attachments" ADD CONSTRAINT "agents_attachments_owner_id_agents_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents_attachments" ADD CONSTRAINT "agents_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_prompts_attachments" ADD CONSTRAINT "quick_prompts_attachments_owner_id_quick_prompts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."quick_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_prompts_attachments" ADD CONSTRAINT "quick_prompts_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_attachments" ADD CONSTRAINT "conversations_attachments_owner_id_conversations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_attachments" ADD CONSTRAINT "conversations_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
