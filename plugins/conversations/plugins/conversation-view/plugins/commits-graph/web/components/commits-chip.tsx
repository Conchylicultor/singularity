import { useMemo } from "react";
import { MdAltRoute, MdPublish } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";
import { pushesResource } from "@plugins/tasks/core";
import { commitDeltaResource } from "../../shared/resources";
import { convCommitsGraphPane } from "../panes";

export function CommitsChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const deltaResult = useResource(commitDeltaResource, {
    attemptId: conversation?.attemptId ?? "",
  });
  const pushesResult = useResource(pushesResource);
  const pushCount = useMemo(
    () => pushesResult.pending ? 0 : pushesResult.data.filter((p) => p.attemptId === conversation?.attemptId).length,
    [pushesResult, conversation?.attemptId],
  );
  const { isOpen, toggle } = convCommitsGraphPane.useToggle({ convId }, { input: { convId } });

  if (deltaResult.pending) return null;
  if (deltaResult.data.mergeBase === null) return null;

  const ahead = deltaResult.data.ahead;
  const behind = deltaResult.data.behind;
  const branch = deltaResult.data.branch;

  const parts = [
    `${ahead} ahead`,
    behind > 0 ? `${behind} behind main` : "main",
    pushCount > 0 ? `${pushCount} push${pushCount !== 1 ? "es" : ""}` : null,
  ].filter(Boolean);
  const title = branch ? `${branch}: ${parts.join(", ")}` : parts.join(", ");

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={title}
      aria-label={title}
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1 px-2 text-xs tabular-nums"
    >
      <MdAltRoute className="size-4" />
      <span className="text-muted-foreground">↑</span>
      <span>{ahead}</span>
      {behind > 0 ? (
        <>
          <span className="text-muted-foreground">↓</span>
          <span className="text-amber-500">{behind}</span>
        </>
      ) : null}
      {pushCount > 0 ? (
        <>
          <span className="text-muted-foreground">·</span>
          <MdPublish className="size-3.5 text-emerald-500" />
          <span className="text-emerald-500">{pushCount}</span>
        </>
      ) : null}
    </Button>
  );
}
