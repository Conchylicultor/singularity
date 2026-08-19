import { fieldsToZodObject } from "@plugins/fields/core";
import {
  salsanuevaPlanningUrl,
  salsanuevaSourceConfigFields,
  type SalsanuevaSourceConfig,
} from "../../core";

// The SAME record the server validates writes against, so what this reads back
// out of the stored jsonb cannot drift from what the form wrote in.
const schema = fieldsToZodObject(salsanuevaSourceConfigFields);

/**
 * A configured source's own page: the school's planning, filtered exactly as
 * this source is. Clicking through shows the same courses on the site.
 *
 * `null` (rather than the server reader's loud `NonRetryableError`) on a blob
 * that no longer fits this type's fields, because the caller is navigation
 * chrome: the refresh job MUST fail loudly on a config it cannot read, while a
 * link with no destination simply isn't offered.
 */
export function salsanuevaSourceOriginUrl(
  config: Record<string, unknown>,
): string | null {
  const parsed = schema.safeParse(config);
  if (!parsed.success) return null;
  return salsanuevaPlanningUrl(parsed.data as SalsanuevaSourceConfig);
}
