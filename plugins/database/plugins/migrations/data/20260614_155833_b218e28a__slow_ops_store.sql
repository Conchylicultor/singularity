CREATE TABLE IF NOT EXISTS "slow_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worktree" text NOT NULL,
	"operation_kind" text NOT NULL,
	"operation" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"total_ms" bigint DEFAULT 0 NOT NULL,
	"max_ms" double precision DEFAULT 0 NOT NULL,
	"last_ms" double precision DEFAULT 0 NOT NULL,
	"threshold_ms" double precision DEFAULT 0 NOT NULL,
	"callers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slow_ops_kind_op_worktree_idx" ON "slow_ops" USING btree ("operation_kind","operation","worktree");