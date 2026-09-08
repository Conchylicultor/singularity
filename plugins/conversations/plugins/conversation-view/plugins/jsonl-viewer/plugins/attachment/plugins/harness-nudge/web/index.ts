import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { HarnessNudgeView } from "./components/harness-nudge-view";

export default {
  collapsed: true,
  description:
    "Renders the one-line coaching notes the harness slips the agent mid-session — the batching reminder and the check-in reminder.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "batching_reminder_sent",
      component: HarnessNudgeView,
    }),
    JsonlViewerAttachment.Renderer({
      match: "silent_turn_reminder",
      component: HarnessNudgeView,
    }),
  ],
} satisfies PluginDefinition;
