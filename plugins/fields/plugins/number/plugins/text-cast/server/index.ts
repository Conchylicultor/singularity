import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { numberFieldType } from "@plugins/fields/plugins/number/core";
import { cast } from "./internal/text-cast";

export default {
  description:
    "Number field type: server text→typed SQL cast capability — presents the raw TEXT storage column as ::numeric for server-delegated DataView filter/sort.",
  contributions: [Fields.ValueTextCast({ type: numberFieldType, cast })],
} satisfies ServerPluginDefinition;
