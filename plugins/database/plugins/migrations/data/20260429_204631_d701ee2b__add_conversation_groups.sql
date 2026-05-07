CREATE TABLE IF NOT EXISTS "conversation_group_members" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"expanded" boolean DEFAULT true NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_group_members" ADD CONSTRAINT "conversation_group_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_group_members" ADD CONSTRAINT "conversation_group_members_group_id_conversation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."conversation_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cgm_group_rank_idx" ON "conversation_group_members" USING btree ("group_id","rank");