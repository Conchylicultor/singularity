import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { PromptSnapshotView } from "./components/prompt-snapshot-view";

export default {
  collapsed: true,
  description:
    "Renders the snapshot of the exact system prompt an agent was given: its size and tool count on the collapsed line, the prompt sections and the tool names (never their descriptions) in the body.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "prompt_snapshot",
      component: PromptSnapshotView,
    }),
  ],
} satisfies PluginDefinition;
