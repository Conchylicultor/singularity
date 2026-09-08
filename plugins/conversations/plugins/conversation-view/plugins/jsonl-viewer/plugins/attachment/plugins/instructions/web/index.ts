import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { InstructionsView } from "./components/instructions-view";

export default {
  collapsed: true,
  description:
    "Renders the instructions attachment — the project instruction files (CLAUDE.md) the harness loaded at launch — as the opening-of-the-session plural twin of the nested-memory card.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "instructions",
      component: InstructionsView,
    }),
  ],
} satisfies PluginDefinition;
