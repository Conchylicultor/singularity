import { useMemo } from "react";
import { MdPublish } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pushesResource } from "@plugins/tasks/shared";

export function PushCounterButton() {
  const { conversation } = conversationPane.useData();
  const { data: pushes } = useResource(pushesResource);

  const count = useMemo(
    () => (pushes ?? []).filter((p) => p.attemptId === conversation.attemptId).length,
    [pushes, conversation.attemptId],
  );

  return (
    <span
      className="inline-flex items-center gap-1 px-1 text-xs tabular-nums text-muted-foreground"
      title={`${count} push${count !== 1 ? "es" : ""}`}
    >
      <MdPublish className="size-4" />
      <span>{count}</span>
    </span>
  );
}
