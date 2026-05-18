import { LogOut } from "lucide-react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { exitConversation } from "../../shared";

export function ExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { mutate, isPending } = useEndpointMutation(exitConversation, {
    onSuccess: () => Shell.Toast({ description: "Conversation closed", variant: "success" }),
    onError: (err) => Shell.Toast({ description: `Exit failed: ${err.message}`, variant: "error" }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={isPending ? "Exiting…" : "Exit"}
      aria-label="Exit"
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <LogOut className="size-3.5" />
    </Button>
  );
}
