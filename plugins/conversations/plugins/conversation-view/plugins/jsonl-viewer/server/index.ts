import type { ServerPluginDefinition } from "@server/types";
import { jsonlEventsResource } from "./internal/jsonl-events-resource";

export default {
  id: "conversation-jsonl-viewer",
  name: "Conversation: JSONL viewer",
  description:
    "Parses Claude's raw JSONL session log and streams it as structured events via the jsonl-events resource.",
  resources: [jsonlEventsResource],
} satisfies ServerPluginDefinition;
