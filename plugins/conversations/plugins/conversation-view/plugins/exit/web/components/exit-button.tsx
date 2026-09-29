import { DropdownMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { useLiveConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { exitConversation } from "../../core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const logoutIcon = symbol("logout");

export function ExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useLiveConversation(conversation);
  const { mutate, isPending } = useEndpointMutation(exitConversation, {
    onSuccess: () =>
      toast({
        type: "conversation",
        title: "Conversation closed",
        description: "Closed without changing task state",
        variant: "success",
      }),
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Close failed",
        description: err.message,
        variant: "error",
      }),
  });

  const disabled =
    isPending ||
    live.status === "gone" ||
    live.status === "done" ||
    live.status === "starting";

  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <Icon icon={logoutIcon} className="size-4" />
      {isPending ? "Closing…" : "Close"}
    </DropdownMenuItem>
  );
}
