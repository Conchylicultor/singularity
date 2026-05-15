import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { AskUserQuestionToolView } from "./components/ask-user-question-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-ask-user-question",
  name: "JSONL Viewer: AskUserQuestion tool renderer",
  description:
    "Renders AskUserQuestion tool calls with question headers, option lists, and answer highlights.",
  contributions: [
    JsonlViewerTool.Renderer({
      name: "AskUserQuestion",
      component: AskUserQuestionToolView,
    }),
  ],
} satisfies PluginDefinition;
