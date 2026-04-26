import { useState } from "react";
import { LogOut } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function ExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const [busy, setBusy] = useState(false);

  const disabled =
    busy || live.status === "gone" || live.status === "starting";

  async function onClick() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/exit`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Shell.Toast({
        description: "Conversation closed",
        variant: "success",
      });
    } catch (err) {
      Shell.Toast({
        description: `Exit failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={busy ? "Exiting…" : "Exit"}
      aria-label="Exit"
      disabled={disabled}
      onClick={onClick}
    >
      <LogOut className="size-3.5" />
    </Button>
  );
}
