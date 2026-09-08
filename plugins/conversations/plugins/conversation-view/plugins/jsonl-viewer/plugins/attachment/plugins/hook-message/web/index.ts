import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { HookMessageView } from "./components/hook-message-view";

export default {
  collapsed: true,
  description:
    "Renders hook_system_message attachment events — a hook's informational line (a tip, a reminder) — as a calm one-line row, distinct from the loud hook-error card.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "hook_system_message",
      component: HookMessageView,
    }),
  ],
} satisfies PluginDefinition;
