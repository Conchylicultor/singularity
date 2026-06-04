import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { QueueOperationRow } from "./components/queue-operation-row";

export default {
  name: "JSONL Viewer: Queue-operation event renderer",
  description:
    "Renders Claude Code prompt-queue events (enqueue/dequeue/remove) in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({
      match: "queue-operation",
      component: QueueOperationRow,
    }),
  ],
} satisfies PluginDefinition;
