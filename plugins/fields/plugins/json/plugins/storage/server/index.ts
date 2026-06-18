import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/server";
import { jsonFieldType } from "@plugins/fields/plugins/json/core";
import { build } from "./internal/storage";

export default {
  description:
    "JSON field type: DB storage capability — maps to a Postgres jsonb column.",
  contributions: [Fields.Storage({ type: jsonFieldType, build })],
} satisfies ServerPluginDefinition;
