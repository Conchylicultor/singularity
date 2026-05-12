ALTER TABLE "conversation_category_colors" ALTER COLUMN "color_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_category_colors" ADD COLUMN "icon_key" text;