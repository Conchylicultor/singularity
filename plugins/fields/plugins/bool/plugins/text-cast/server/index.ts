import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";
import { cast } from "./internal/text-cast";

export default {
  description:
    "Boolean field type: server text→typed SQL cast capability — presents the raw TEXT storage column as ::boolean for server-delegated DataView filter/sort.",
  contributions: [Fields.ValueTextCast({ type: boolFieldType, cast })],
} satisfies ServerPluginDefinition;
