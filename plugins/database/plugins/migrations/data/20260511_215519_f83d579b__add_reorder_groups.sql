CREATE TABLE IF NOT EXISTS "reorder_group_members" (
	"slot_id" text NOT NULL,
	"contribution_id" text NOT NULL,
	"group_id" text NOT NULL,
	"rank" "rank_text" NOT NULL,
	CONSTRAINT "reorder_group_members_slot_id_contribution_id_pk" PRIMARY KEY("slot_id","contribution_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reorder_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"title" text DEFAULT 'Group' NOT NULL,
	"expanded" boolean DEFAULT true NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reorder_group_members" ADD CONSTRAINT "reorder_group_members_group_id_reorder_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."reorder_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rgm_group_rank_idx" ON "reorder_group_members" USING btree ("group_id","rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rg_slot_rank_idx" ON "reorder_groups" USING btree ("slot_id","rank");