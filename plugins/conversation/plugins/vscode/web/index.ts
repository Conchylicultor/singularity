import type { PluginDefinition } from "@core";
import type { ClaudeSession } from "@plugins/claude-sessions/shared/types";
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
        const res = await fetch("/api/claude-sessions");
        const sessions: ClaudeSession[] = await res.json();
        const session = sessions.find((s) => s.name === conversation.id);
        if (!session?.cwd) return;
        window.open(
          `http://localhost:8110/?folder=${encodeURIComponent(session.cwd)}`,
          "_blank",
        );
      },
    }),
  ],
};

export default vscodePlugin;
