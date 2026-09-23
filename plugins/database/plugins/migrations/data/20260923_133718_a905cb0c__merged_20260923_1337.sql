ALTER TABLE "slow_ops" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "slow_ops" ADD COLUMN "measures" jsonb DEFAULT '{}'::jsonb NOT NULL;