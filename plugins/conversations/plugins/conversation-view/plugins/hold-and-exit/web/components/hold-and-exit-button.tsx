import { PauseCircle } from "lucide-react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";
import { holdAndExit } from "../../shared";

export function HoldAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { mutate, isPending } = useEndpointMutation(holdAndExit, {
    onSuccess: () => toast({ type: "conversation", description: "Task held — conversation closed", variant: "success" }),
    onError: (err) => toast({ type: "conversation", description: `Hold & Exit failed: ${err.message}`, variant: "error" }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={isPending ? "Holding…" : "Hold & Exit"}
      aria-label="Hold & Exit"
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <PauseCircle className="size-3.5" />
    </Button>
  );
}
