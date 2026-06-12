import { DropdownMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdCheckCircle, MdDeleteForever, MdExitToApp } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useHasActiveSiblings } from "@plugins/conversations/web";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/notifications/web";
import { pushesResource } from "@plugins/tasks/core";
import { dropAndExit } from "../../core";

export function DropAndExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const pushesResult = useResource(pushesResource);
  const siblingsResult = useHasActiveSiblings(conversation.taskId, conversation.id);
  // The label/destructiveness decision reads TWO independently-arriving
  // resources; gate on both so the destructive "Drop & Exit" default can never
  // show (or be clicked) while either is still loading.
  const decision = useCombinedResources({
    pushes: pushesResult,
    hasOtherActive: siblingsResult,
  });

  const hasPush = useMemo(
    () =>
      !decision.pending &&
      decision.data.pushes.some((p) => p.attemptId === conversation.attemptId),
    [decision, conversation.attemptId],
  );

  const { mutate, isPending } = useEndpointMutation(dropAndExit, {
    onSuccess: (data) => {
      const title = data.dropped ? "Task dropped" : "Conversation closed";
      const description = data.dropped ? "Task marked dropped and conversation closed" : "Conversation closed without changing task state";
      toast({ type: "conversation", title, description, variant: "success" });
    },
    onError: (err) => toast({
      type: "conversation",
      title: `${hasPush ? "Complete" : "Drop"} & Close failed`,
      description: err.message,
      variant: "error",
    }),
  });

  const disabled = isPending || decision.pending || live.status === "gone" || live.status === "done" || live.status === "starting";

  // Neutral while loading — never the destructive default.
  const { Icon, label, variant } = decision.pending
    ? { Icon: MdExitToApp, label: "Close", variant: "default" as const }
    : hasPush
      ? { Icon: MdCheckCircle, label: isPending ? "Completing…" : "Complete & Close", variant: "default" as const }
      : decision.data.hasOtherActive
        ? { Icon: MdExitToApp, label: isPending ? "Closing…" : "Close", variant: "default" as const }
        : { Icon: MdDeleteForever, label: isPending ? "Dropping…" : "Drop & Close", variant: "destructive" as const };

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
