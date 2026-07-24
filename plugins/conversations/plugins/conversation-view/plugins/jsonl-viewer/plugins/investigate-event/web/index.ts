import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlRowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { InvestigateEventAction } from "./components/investigate-event-action";

export default {
  description:
    "Contributes the add-a-renderer row action to every JSONL transcript row whose nearest dispatch fell back (unhandled event kind, tool name, or attachment subtype), launching an agent briefed to implement the missing renderer for that dispatch key.",
  contributions: [
    JsonlRowActions.Item({ id: "investigate-event", component: InvestigateEventAction }),
  ],
} satisfies PluginDefinition;
