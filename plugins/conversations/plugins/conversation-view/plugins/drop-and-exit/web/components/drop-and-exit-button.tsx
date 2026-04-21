import { useState } from "react";
import { MdDeleteForever } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function DropAndExitButton({
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
        `/api/conversations/${encodeURIComponent(conversation.id)}/drop-and-exit`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Shell.Toast({
        description: "Task dropped and conversation closed",
        variant: "success",
      });
    } catch (err) {
      Shell.Toast({
        description: `Drop & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
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
      title="Drop & Exit"
      aria-label="Drop & Exit"
      disabled={disabled}
      onClick={onClick}
      className="gap-1.5 shadow-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      <MdDeleteForever className="size-4" />
      {busy ? "Dropping…" : "Drop & Exit"}
    </Button>
  );
}
