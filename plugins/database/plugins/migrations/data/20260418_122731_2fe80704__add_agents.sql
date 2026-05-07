CREATE TABLE IF NOT EXISTS "agent_launches" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"description" text,
	"prompt" text,
	"model" text,
	"expanded" boolean DEFAULT false NOT NULL,
	"rank" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_parent_id_agents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_launches_agent_id_idx" ON "agent_launches" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_parent_rank_idx" ON "agents" USING btree ("parent_id","rank");--> statement-breakpoint
CREATE VIEW "public"."agents_v" AS (select "id", "parent_id", "name", "description", "prompt", "model", "expanded", "rank", "created_at", "updated_at", ("prompt" IS NULL) as "is_folder" from "agents");