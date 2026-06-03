import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { DependenciesButton } from "./components/dependencies-button";

export default {
  name: "Conversation: Dependencies",
  description:
    "Unified prompt-bar button showing blocked-by and blocking dependency counts with per-direction edit popovers.",
  contributions: [
    Conversation.PromptBar({
      id: "dependencies",
      component: DependenciesButton,
      section: "Deps",
      sectionOrder: 0,
    }),
  ],
} satisfies PluginDefinition;
