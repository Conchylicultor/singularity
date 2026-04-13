import type { PluginDefinition } from "@core";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared/types";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { MdCode } from "react-icons/md";

const vscodePlugin: PluginDefinition = {
  id: "conversation-vscode",
  name: "Conversation: VSCode",
  description: "Opens the conversation's worktree in VSCode.",
  contributions: [
    Conversation.Toolbar({
      label: "VSCode",
      icon: MdCode,
      onClick: async (conversation) => {
        const res = await fetch(`/api/conversations/${conversation.id}`);
        if (!res.ok) return;
        const record = (await res.json()) as ConversationRecord;
        if (!record.worktreePath) return;
        window.open(
          `http://localhost:8110/?folder=${encodeURIComponent(record.worktreePath)}`,
          "_blank",
        );
      },
    }),
  ],
};

export default vscodePlugin;
