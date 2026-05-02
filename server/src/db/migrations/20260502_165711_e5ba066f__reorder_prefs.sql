CREATE TABLE IF NOT EXISTS "reorder_prefs" (
	"slot_id" text NOT NULL,
	"contribution_id" text NOT NULL,
	"rank" "rank_text" NOT NULL,
	CONSTRAINT "reorder_prefs_slot_id_contribution_id_pk" PRIMARY KEY("slot_id","contribution_id")
);
