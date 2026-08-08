import { fieldsToZodObject } from "@plugins/fields/core";
import {
  DMDA_ORIGIN,
  dmdaKindPath,
  dmdaSourceConfigFields,
  type DmdaSourceConfig,
} from "../../core";

// The SAME record the server validates writes against, so what this reads back
// out of the stored jsonb cannot drift from what the form wrote in.
const schema = fieldsToZodObject(dmdaSourceConfigFields);

/**
 * A configured source's own page: the site's human listing for its category.
 *
 * `null` (rather than the server reader's loud `NonRetryableError`) on a blob
 * that no longer fits this type's fields, because the caller is navigation
 * chrome: the refresh job MUST fail loudly on a config it cannot read, while a
 * link with no destination simply isn't offered.
 */
export function dmdaSourceOriginUrl(
  config: Record<string, unknown>,
): string | null {
  const parsed = schema.safeParse(config);
  if (!parsed.success) return null;
  const path = dmdaKindPath((parsed.data as DmdaSourceConfig).kind);
  return path === null ? null : `${DMDA_ORIGIN}${path}`;
}
