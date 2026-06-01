import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { SkillToolView } from "./components/skill-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-skill",
  name: "JSONL Viewer: Skill tool renderer",
  description:
    "Renders Skill tool calls with skill name, args preview, and injected context.",
  contributions: [
    JsonlViewerTool.Renderer({ match: "Skill", component: SkillToolView }),
  ],
} satisfies PluginDefinition;
