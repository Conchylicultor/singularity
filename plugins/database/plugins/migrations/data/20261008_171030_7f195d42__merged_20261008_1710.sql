-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "conversations_ext_usage" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"tokens" double precision DEFAULT 0 NOT NULL,
	"cache_read_tokens" double precision DEFAULT 0 NOT NULL,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "conversation_usage_files" (
	"conversation_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"offset" bigint NOT NULL,
	"buckets" jsonb NOT NULL,
	"tail_hashes" jsonb NOT NULL,
	CONSTRAINT "conversation_usage_files_conversation_id_path_pk" PRIMARY KEY("conversation_id","path")
);
CREATE INDEX IF NOT EXISTS "conversation_usage_files_conv_idx" ON "conversation_usage_files" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_sessions_by_session_idx" ON "conversation_sessions" USING btree ("claude_session_id");
CREATE INDEX IF NOT EXISTS "conversations_claude_session_id_idx" ON "conversations" USING btree ("claude_session_id");
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "conversations_ext_usage" ADD CONSTRAINT "conversations_ext_usage_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversation_usage_files" ADD CONSTRAINT "conversation_usage_files_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
