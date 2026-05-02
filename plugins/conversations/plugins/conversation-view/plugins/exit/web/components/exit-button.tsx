import { LogOut } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationAction } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";

export function ExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { trigger, busy } = useConversationAction(conversation.id, "exit", {
    successMessage: "Conversation closed",
    errorMessage: "Exit failed",
  });

  const disabled = busy || live.status === "gone" || live.status === "starting";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={busy ? "Exiting…" : "Exit"}
      aria-label="Exit"
      disabled={disabled}
      onClick={trigger}
    >
      <LogOut className="size-3.5" />
    </Button>
  );
}
