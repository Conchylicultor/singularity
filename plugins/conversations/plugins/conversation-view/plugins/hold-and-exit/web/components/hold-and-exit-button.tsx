import { PauseCircle } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationAction } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";

export function HoldAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { trigger, busy } = useConversationAction(conversation.id, "hold-and-exit", {
    successMessage: "Task held — conversation closed",
    errorMessage: "Hold & Exit failed",
  });

  const disabled = busy || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={busy ? "Holding…" : "Hold & Exit"}
      aria-label="Hold & Exit"
      disabled={disabled}
      onClick={trigger}
    >
      <PauseCircle className="size-3.5" />
    </Button>
  );
}
