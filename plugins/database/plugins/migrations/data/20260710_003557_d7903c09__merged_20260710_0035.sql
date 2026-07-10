CREATE TABLE IF NOT EXISTS "data_view_row_order" (
	"data_view_id" text NOT NULL,
	"view_id" text NOT NULL,
	"row_key" text NOT NULL,
	"rank" "rank_text" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_view_row_order_data_view_id_view_id_row_key_pk" PRIMARY KEY("data_view_id","view_id","row_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dvro_view_idx" ON "data_view_row_order" USING btree ("data_view_id","view_id");