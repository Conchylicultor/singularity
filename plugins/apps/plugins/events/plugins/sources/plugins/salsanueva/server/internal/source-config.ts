import { fieldsToZodObject } from "@plugins/fields/core";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  salsanuevaSourceConfigFields,
  type SalsanuevaSourceConfig,
} from "../../core";

// One zod object, derived from the SAME `configFields` the create/update
// endpoints validate against, so the form, the stored jsonb, and what `probe`
// reads cannot drift.
const schema = fieldsToZodObject(salsanuevaSourceConfigFields);

/**
 * Re-read a row's stored `config` as this type's config.
 *
 * `events-core` already validated it on write, so a failure here means the row
 * predates a field change (or was written straight into the DB) — deterministic,
 * so `NonRetryableError`: a retry re-reads the identical row.
 *
 * Note what this does NOT reject: a filter value that is no longer in the
 * catalogue. The fields accept any string on purpose (see `tags/config`), so a
 * season's renaming costs a caveat on the run, not a source that fails to load.
 */
export function readSalsanuevaSourceConfig(
  config: unknown,
): SalsanuevaSourceConfig {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new NonRetryableError(
      `Invalid config for a "salsanueva" event source: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  return parsed.data as SalsanuevaSourceConfig;
}
