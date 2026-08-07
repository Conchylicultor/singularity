import { fieldsToZodObject } from "@plugins/fields/core";
import { urlSourceConfigFields, type UrlSourceConfig } from "../../core";

// The SAME record the server validates writes against, so what this reads back
// out of the stored jsonb cannot drift from what the form wrote in.
const schema = fieldsToZodObject(urlSourceConfigFields);

/**
 * A configured web-page source's own page: exactly the URL the user pointed it at.
 *
 * `null` (rather than the server reader's loud `NonRetryableError`) on a blob that
 * no longer fits this type's fields, because the caller is navigation chrome: the
 * refresh job MUST fail loudly on a config it cannot read, while a link that has
 * no destination simply isn't offered. The Settings section is where that same row
 * says its config is invalid.
 */
export function urlSourceOriginUrl(config: Record<string, unknown>): string | null {
  const parsed = schema.safeParse(config);
  return parsed.success ? (parsed.data as UrlSourceConfig).url : null;
}
