import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { jsonlEventsResource } from "./internal/jsonl-events-resource";

export default {
  name: "Conversation: JSONL viewer",
  description:
    "Parses Claude's raw JSONL session log and streams it as structured events via the jsonl-events resource.",
  contributions: [Resource.Declare(jsonlEventsResource)],
} satisfies ServerPluginDefinition;
