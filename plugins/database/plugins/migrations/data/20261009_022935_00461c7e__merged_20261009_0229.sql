-- singularity:phase expand
ALTER TABLE "op_log_ops" ADD COLUMN "sleeps" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "op_log_ops" ADD COLUMN "sleep_stamp" jsonb;
-- singularity:phase contract
-- singularity:claims
