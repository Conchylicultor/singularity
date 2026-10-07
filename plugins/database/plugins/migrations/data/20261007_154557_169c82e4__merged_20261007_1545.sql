-- singularity:phase expand
ALTER TABLE "chord_curriculum" ADD COLUMN "extras" jsonb DEFAULT '0'::jsonb NOT NULL;
-- singularity:phase contract
ALTER TABLE "chord_curriculum" DROP COLUMN IF EXISTS "modes";
-- singularity:claims
