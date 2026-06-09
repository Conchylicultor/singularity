import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { MetaPromptRow } from "./components/meta-prompt-row";

export default {
  description:
    "Renders harness-injected prompt turns (loop/queue wakeups, resumes) distinctly from human user messages.",
  contributions: [
    JsonlViewer.EventRenderer({ match: "meta-prompt", component: MetaPromptRow }),
  ],
} satisfies PluginDefinition;
