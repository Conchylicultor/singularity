import { fieldsToZodObject } from "@plugins/fields/core";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  coworkmeetSourceConfigFields,
  type CoworkmeetSourceConfig,
} from "../../core";

// One zod object, derived from the SAME `configFields` the create/update
// endpoints validate against, so the form, the stored jsonb, and what `probe`
// reads cannot drift.
const schema = fieldsToZodObject(coworkmeetSourceConfigFields);

/**
 * Re-read a row's stored `config` as this type's config.
 *
 * `events-core` already validated it on write, so a failure here means the row
 * predates a field change (or was written straight into the DB) — deterministic,
 * so `NonRetryableError`: a retry re-reads the identical row.
 *
 * Note what this does NOT reject: a filter value the catalogue no longer offers.
 * The fields accept any string on purpose (see `tags/config`), so a renamed
 * vocabulary costs a caveat on the run, not a source that fails to load.
 */
export function readCoworkmeetSourceConfig(
  config: unknown,
): CoworkmeetSourceConfig {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new NonRetryableError(
      `Invalid config for a "coworkmeet" event source: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  return parsed.data as CoworkmeetSourceConfig;
}
