ALTER TABLE "reorder_prefs" ALTER COLUMN "rank" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reorder_prefs" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;