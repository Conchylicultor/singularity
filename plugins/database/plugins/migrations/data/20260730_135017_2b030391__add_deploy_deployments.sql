CREATE TABLE IF NOT EXISTS "deploy_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"composition_id" text NOT NULL,
	"server_id" text NOT NULL,
	"hostnames" text[] NOT NULL,
	"loopback_port" integer DEFAULT 9100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deploy_servers_ext_health" ADD COLUMN "platform" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deploy_deployments" ADD CONSTRAINT "deploy_deployments_server_id_deploy_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."deploy_servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deploy_deployments_composition_server_uq" ON "deploy_deployments" USING btree ("composition_id","server_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deploy_deployments_server_port_uq" ON "deploy_deployments" USING btree ("server_id","loopback_port");