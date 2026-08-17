import { DropdownMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdCheckCircle, MdDeleteForever } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import {
  useConversation,
  useHasActiveSiblings,
} from "@plugins/conversations/web";
import {
  useResource,
  useCombinedResources,
} from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import {
  attemptWorkResource,
  standingOf,
} from "@plugins/tasks/plugins/attempt-work/core";
import { dropAndExit } from "../../core";

export function DropAndExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  // The attempt's standing relative to `main`, measured from git. NOT the
  // `pushes` ledger this used to read: that table is written by a background
  // ingest job, so an empty result meant either "nothing was pushed" or "nothing
  // has been ingested yet" — and reading it as the former picked the destructive
  // "Drop & Close" label over landed work.
  const workResult = useResource(attemptWorkResource, {
    attemptId: conversation.attemptId,
  });
  const siblingsResult = useHasActiveSiblings(
    conversation.taskId,
    conversation.id,
  );
  // The label/destructiveness decision reads TWO independently-arriving
  // resources; gate on both so the destructive "Drop & Exit" default can never
  // show (or be clicked) while either is still loading.
  const decision = useCombinedResources({
    work: workResult,
    hasOtherActive: siblingsResult,
  });

  // `null` = no standing to decide on: either the combine is still pending, or
  // the server could measure nothing (the `Resolvable` unresolved arm). The
  // readiness gate folds an errored input into `pending`, so a settled decision
  // is one the server vouches for — no separate error guard needed.
  //
  // `standingOf` is the only thing consulted here: a discriminated
  // "none" | "pending" | "landed", never a length compared to zero (invariant
  // I4), so there is no array whose emptiness this component could misread.
  const standing = useMemo(
    () =>
      !decision.pending && decision.data.work.resolved
        ? standingOf(decision.data.work.value)
        : null,
    [decision],
  );
  const hasWork = standing !== null && standing !== "none";

  const { mutate, isPending } = useEndpointMutation(dropAndExit, {
    onSuccess: (data) => {
      const title = data.dropped ? "Task dropped" : "Conversation closed";
      const description = data.dropped
        ? "Task marked dropped and conversation closed"
        : "Conversation closed without changing task state";
      toast({ type: "conversation", title, description, variant: "success" });
    },
    onError: (err) =>
      toast({
        type: "conversation",
        title: `${hasWork ? "Complete" : "Drop"} & Close failed`,
        description: err.message,
        variant: "error",
      }),
  });

  // Dropping the task only makes sense when this is the last active conversation
  // on it. If a sibling is still active, the plain "Close" exit entry already
  // covers closing this one — hide this entry rather than degrade it to a
  // redundant "Close" (mirrors how Drop dependents hides when there's nothing
  // to drop).
  //
  // A `null` standing hides the entry for the same reason: an errored
  // `hasOtherActive` keeps the combine pending (the readiness gate never lets a
  // stale value decide), and an unresolved `work` means the server could not
  // measure this attempt at all. The plain "Close" exit entry already covers
  // both cases, and putting a destructive label over an unknown standing is
  // precisely what this change removes. Unknown state is never a licence to drop
  // a task.
  if (decision.pending || decision.data.hasOtherActive || standing === null)
    return null;

  const disabled =
    isPending ||
    live.status === "gone" ||
    live.status === "done" ||
    live.status === "starting";

  const { Icon, label, variant } = hasWork
    ? {
        Icon: MdCheckCircle,
        label: isPending ? "Completing…" : "Complete & Close",
        variant: "default" as const,
      }
    : {
        Icon: MdDeleteForever,
        label: isPending ? "Dropping…" : "Drop & Close",
        variant: "destructive" as const,
      };

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
