CREATE TABLE IF NOT EXISTS "deploy_servers_ext_health" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"failure_kind" text,
	"failure_message" text,
	"checked_public_key" text,
	"host_key_line" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deploy_servers_ext_health" ADD CONSTRAINT "deploy_servers_ext_health_parent_id_deploy_servers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."deploy_servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "deploy_servers" DROP COLUMN IF EXISTS "status";