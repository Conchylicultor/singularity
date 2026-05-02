import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ResumeButton } from "./components/resume-button";

export default {
  id: "conversation-resume",
  name: "Conversation: Resume",
  description:
    "Toolbar button that resumes a gone conversation via `claude --resume <claude-id>`.",
  contributions: [
    Conversation.PromptBar({ id: "resume", component: ResumeButton, section: "Exit", sectionOrder: 1 }),
  ],
} satisfies PluginDefinition;
