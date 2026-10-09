-- singularity:phase expand
ALTER TABLE "conversations" ADD COLUMN "waiting_menu" jsonb;
-- singularity:phase contract
-- singularity:claims
