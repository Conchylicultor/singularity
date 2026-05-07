CREATE TABLE IF NOT EXISTS "yak_shaving_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"parent_node_id" text,
	"one_line_context" text,
	"next_action" text,
	"status" text,
	"rank" "rank_text",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yak_shaving_nodes_conv_idx" ON "yak_shaving_nodes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yak_shaving_nodes_parent_idx" ON "yak_shaving_nodes" USING btree ("parent_node_id");