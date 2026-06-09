import { useMemo } from "react";
import { MdCheckCircle, MdDeleteForever, MdExitToApp } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversations } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/notifications/web";
import { pushesResource } from "@plugins/tasks/core";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dropAndExit } from "../../core";

export function DropAndExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const pushesResult = useResource(pushesResource);
  const conv = useConversations();

  const hasPush = useMemo(
    () => pushesResult.pending ? false : pushesResult.data.some((p) => p.attemptId === conversation.attemptId),
    [pushesResult, conversation.attemptId],
  );

  const hasOtherActive = useMemo(
    () => conv.pending ? false : conv.active.some((c) => c.taskId === conversation.taskId && c.id !== conversation.id),
    [conv, conversation.taskId, conversation.id],
  );

  const { mutate, isPending } = useEndpointMutation(dropAndExit, {
    onSuccess: (data) => {
      const title = data.dropped ? "Task dropped" : "Conversation closed";
      const description = data.dropped ? "Task marked dropped and conversation closed" : "Conversation closed without changing task state";
      toast({ type: "conversation", title, description, variant: "success" });
    },
    onError: (err) => toast({
      type: "conversation",
      title: `${hasPush ? "Complete" : "Drop"} & Exit failed`,
      description: err.message,
      variant: "error",
    }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  if (conv.pending) return null;

  const { Icon, label, variant } = hasPush
    ? { Icon: MdCheckCircle, label: isPending ? "Completing…" : "Complete & Exit", variant: "default" as const }
    : hasOtherActive
      ? { Icon: MdExitToApp, label: isPending ? "Closing…" : "Exit", variant: "default" as const }
      : { Icon: MdDeleteForever, label: isPending ? "Dropping…" : "Drop & Exit", variant: "destructive" as const };

  return (
    <DropdownMenuItem
      variant={variant}
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <Icon className="size-4" />
      {label}
    </DropdownMenuItem>
  );
}
