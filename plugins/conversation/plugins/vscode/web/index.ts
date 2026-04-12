import type { PluginDefinition } from "@core";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared/types";
import { Conversation } from "@plugins/conversation/web/slots";
import { MdCode } from "react-icons/md";

const vscodePlugin: PluginDefinition = {
  id: "conversation-vscode",
  name: "Conversation: VSCode",
  contributions: [
    Conversation.Toolbar({
      label: "VSCode",
      icon: MdCode,
      onClick: async (conversation) => {
        const res = await fetch("/api/conversations");
        const conversations: ConversationRecord[] = await res.json();
        const record = conversations.find((c) => c.name === conversation.id);
        if (!record?.cwd) return;
        window.open(
          `http://localhost:8110/?folder=${encodeURIComponent(record.cwd)}`,
          "_blank",
        );
      },
    }),
  ],
};

export default vscodePlugin;
