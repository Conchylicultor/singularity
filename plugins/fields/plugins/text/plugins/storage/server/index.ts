import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { textFieldType } from "@plugins/fields/plugins/text/core";
import { build } from "./internal/storage";

export default {
  description:
    "Text field type: DB storage capability — maps to a Postgres text column.",
  contributions: [Fields.Storage({ type: textFieldType, build })],
} satisfies ServerPluginDefinition;
