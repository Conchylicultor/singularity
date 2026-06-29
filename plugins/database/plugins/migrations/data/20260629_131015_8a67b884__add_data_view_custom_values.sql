CREATE TABLE IF NOT EXISTS "data_view_custom_values" (
	"data_view_id" text NOT NULL,
	"row_key" text NOT NULL,
	"column_id" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_view_custom_values_data_view_id_row_key_column_id_pk" PRIMARY KEY("data_view_id","row_key","column_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dvcv_data_view_id_idx" ON "data_view_custom_values" USING btree ("data_view_id");