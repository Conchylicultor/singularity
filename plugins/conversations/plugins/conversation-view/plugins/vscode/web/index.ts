import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { MdCode } from "react-icons/md";

export default {
  id: "conversation-vscode",
  name: "Conversation: VSCode",
  description: "Opens the conversation's worktree in VSCode.",
  contributions: [
    Conversation.Toolbar({
      label: "VSCode",
      icon: MdCode,
      onClick: (conversation) => {
        if (!conversation.worktreePath) return;
        window.open(
          `http://localhost:8110/?folder=${encodeURIComponent(conversation.worktreePath)}`,
          "_blank",
        );
      },
    }),
  ],
} satisfies PluginDefinition;
