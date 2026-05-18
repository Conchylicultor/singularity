import { useMemo } from "react";
import { MdCheckCircle, MdDeleteForever, MdExitToApp } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversations } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { pushesResource } from "@plugins/tasks/core";
import { Button } from "@/components/ui/button";
import { dropAndExit } from "../../shared";

export function DropAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const pushesResult = useResource(pushesResource);
  const { active } = useConversations();

  const hasPush = useMemo(
    () => pushesResult.pending ? false : pushesResult.data.some((p) => p.attemptId === conversation.attemptId),
    [pushesResult, conversation.attemptId],
  );

  const hasOtherActive = useMemo(
    () => active.some((c) => c.taskId === conversation.taskId && c.id !== conversation.id),
    [active, conversation.taskId, conversation.id],
  );

  const { mutate, isPending } = useEndpointMutation(dropAndExit, {
    onSuccess: (data) => {
      const description = data.dropped ? "Task dropped and conversation closed" : "Conversation closed";
      Shell.Toast({ description, variant: "success" });
    },
    onError: (err) => Shell.Toast({
      description: `${hasPush ? "Complete" : "Drop"} & Exit failed: ${err.message}`,
      variant: "error",
    }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  if (hasPush) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        title={isPending ? "Completing…" : "Complete & Exit"}
        aria-label="Complete & Exit"
        disabled={disabled}
        onClick={() => mutate({ params: { id: conversation.id } })}
        className="border-emerald-300/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
      >
        <MdCheckCircle className="size-3.5" />
      </Button>
    );
  }

  if (hasOtherActive) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        title={isPending ? "Closing…" : "Exit"}
        aria-label="Exit"
        disabled={disabled}
        onClick={() => mutate({ params: { id: conversation.id } })}
      >
        <MdExitToApp className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button
      variant="destructive"
      size="icon-sm"
      title={isPending ? "Dropping…" : "Drop & Exit"}
      aria-label="Drop & Exit"
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <MdDeleteForever className="size-3.5" />
    </Button>
  );
}
