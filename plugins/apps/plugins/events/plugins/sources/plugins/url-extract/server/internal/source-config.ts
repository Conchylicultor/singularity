import { fieldsToZodObject } from "@plugins/fields/core";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  urlSourceConfigFields,
  type UrlSourceConfig,
} from "../../core";

// One zod object, derived from the SAME `configFields` the create/update
// endpoints validate against, so the form, the stored jsonb, and what `probe`
// reads cannot drift.
const schema = fieldsToZodObject(urlSourceConfigFields);

/**
 * Re-read a row's stored `config` as this type's config.
 *
 * `events-core` already validated it on write, so a failure here means the row
 * predates a field change (or was written straight into the DB) — deterministic,
 * so `NonRetryableError`: a retry re-reads the identical row. Loud and terminal
 * beats handing `parsePublicUrl` an `undefined`.
 */
export function readUrlSourceConfig(config: unknown): UrlSourceConfig {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new NonRetryableError(
      `Invalid config for a "url" event source: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  return parsed.data as UrlSourceConfig;
}
