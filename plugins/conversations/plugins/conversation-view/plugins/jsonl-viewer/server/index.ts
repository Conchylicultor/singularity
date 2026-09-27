import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { jsonlEventsServed } from "./internal/jsonl-events-resource";

export default {
  description:
    "Parses Claude's raw JSONL session log and streams it as structured events via the jsonl-events resource.",
  contributions: [...jsonlEventsServed.declare],
} satisfies ServerPluginDefinition;
