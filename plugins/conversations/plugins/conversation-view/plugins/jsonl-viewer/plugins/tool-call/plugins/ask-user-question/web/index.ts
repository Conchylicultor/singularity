import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { isInterruptContent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { AskUserQuestionToolView } from "./components/ask-user-question-tool-view";
import { AnswerHereButton } from "./components/answer-here-button";
import { ANSWER_MARKER } from "../shared";

export default {
  id: "conversation-jsonl-viewer-tool-call-ask-user-question",
  name: "JSONL Viewer: AskUserQuestion tool renderer",
  description:
    "Renders AskUserQuestion tool calls with question headers, option lists, and answer highlights.",
  contributions: [
    JsonlViewerTool.Renderer({
      match: "AskUserQuestion",
      component: AskUserQuestionToolView,
    }),
    JsonlViewer.PendingPrompt({
      match: "question",
      component: AnswerHereButton,
    }),
    JsonlViewer.EventFilter({
      id: "ask-user-question:suppress-answer-turn",
      hide: (event) =>
        event.kind === "user-text" && event.text.startsWith(ANSWER_MARKER),
    }),
    // Hide the standalone "[Request interrupted by user for tool use]" turn the
    // CLI emits when a tool (e.g. an AskUserQuestion menu) is cancelled — the
    // cancellation is already conveyed by the question card's awaiting/answered
    // state, so the bare row is pure noise.
    JsonlViewer.EventFilter({
      id: "ask-user-question:suppress-interrupt-turn",
      hide: (event) =>
        event.kind === "user-text" && isInterruptContent(event.text),
    }),
  ],
} satisfies PluginDefinition;
