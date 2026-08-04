ALTER TABLE "release_runs" ADD COLUMN "kind" text DEFAULT 'staged' NOT NULL;--> statement-breakpoint
ALTER TABLE "release_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "release_runs" ADD COLUMN "commit_dirty" boolean;