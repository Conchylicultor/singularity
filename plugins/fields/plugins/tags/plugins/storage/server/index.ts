import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { tagsFieldType } from "@plugins/fields/plugins/tags/core";
import { build } from "./internal/storage";

export default {
  description:
    "Tags field type: DB storage capability — maps to a Postgres jsonb column.",
  contributions: [Fields.Storage({ type: tagsFieldType, build })],
} satisfies ServerPluginDefinition;
