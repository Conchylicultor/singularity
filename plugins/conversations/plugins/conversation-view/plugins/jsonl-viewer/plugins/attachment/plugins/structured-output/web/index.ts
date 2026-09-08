import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { StructuredOutputView } from "./components/structured-output-view";

export default {
  collapsed: true,
  description:
    "Renders the schema-shaped result a subagent returned: its headline field on the collapsed line, and a readable one-level reading of the arbitrary result object in the body.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "structured_output",
      component: StructuredOutputView,
    }),
  ],
} satisfies PluginDefinition;
