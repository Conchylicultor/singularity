import { useState } from "react";
import { PauseCircle } from "lucide-react";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function HoldAndExitButton({
  conversation,
}: {
  conversation: ConversationState;
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
        `/api/conversations/${encodeURIComponent(conversation.id)}/hold-and-exit`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Shell.Toast({
        description: "Task held — conversation closed",
        variant: "success",
      });
    } catch (err) {
      Shell.Toast({
        description: `Hold & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="default"
      size="default"
      title="Hold & Exit"
      aria-label="Hold & Exit"
      disabled={disabled}
      onClick={onClick}
      className="gap-1.5 shadow-lg"
    >
      <PauseCircle className="size-4" />
      {busy ? "Holding…" : "Hold & Exit"}
    </Button>
  );
}
