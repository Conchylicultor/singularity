import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { ToolOutputNoticeView } from "./components/tool-output-notice-view";

export default {
  collapsed: true,
  description:
    "Renders the harness's notes about a tool's output — a Read that came back partial, and a Bash command whose output only the agent saw.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "read_truncation_notice",
      component: ToolOutputNoticeView,
    }),
    JsonlViewerAttachment.Renderer({
      match: "bash_output_audience_note",
      component: ToolOutputNoticeView,
    }),
  ],
} satisfies PluginDefinition;
