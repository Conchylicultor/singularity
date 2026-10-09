-- singularity:phase expand
ALTER TABLE "sonata_songs_ext_rhythm" ADD COLUMN "groove_preset_id" text;
ALTER TABLE "supervised_job_runs" ADD COLUMN "cancelled_at" timestamp with time zone;
-- singularity:phase contract
-- singularity:claims
