import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConversationArtifacts } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/web";
import { RESEARCH_KIND, extractResearch } from "./internal/research-docs";
import { RESEARCH_ICON, ResearchSection } from "./components/research-section";

export default {
  description:
    "Research docs as a conversation artifact: the design docs it wrote, changed or read (research/*.md, and a sidequest's own), listed as rows that open in the file-peek pane beside the conversation.",
  contributions: [
    ConversationArtifacts.Kind({
      id: RESEARCH_KIND,
      label: "Research",
      icon: RESEARCH_ICON,
      origin: "produced",
      extract: extractResearch,
      Section: ResearchSection,
    }),
  ],
} satisfies PluginDefinition;
