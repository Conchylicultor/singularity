import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

/**
 * The `jsonb` column holding a tags value, decoded by the FIELD's own schema.
 *
 * The `json` sibling's `z.unknown()` branch has no counterpart here: the `tags`
 * token declares `string[]`, so a `ZodParser<V extends string[]>` can never be a
 * `ZodUnknown` (its output would have to be `unknown`). Every tags schema
 * narrows the column, so every tags column decodes.
 *
 * `tagsField` still has no `defineEntity` call site — it is used in config_v2
 * surfaces only — so nothing is guarded by this today. What changed is that it
 * no longer needs a cast to be usable in a table when one appears.
 */
export const decode = <V extends string[]>(
  name: string,
  valueSchema: ZodParser<V>,
): StorageColumnFor<V> => parsedJson(name, valueSchema);
