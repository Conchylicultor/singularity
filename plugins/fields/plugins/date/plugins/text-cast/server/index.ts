import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { dateFieldType } from "@plugins/fields/plugins/date/core";
import { cast } from "./internal/text-cast";

export default {
  description:
    "Date field type: server text→typed SQL cast capability — presents the raw TEXT storage column as ::timestamptz for server-delegated DataView filter/sort.",
  contributions: [Fields.ValueTextCast({ type: dateFieldType, cast })],
} satisfies ServerPluginDefinition;
