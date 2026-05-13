import { useMemo } from "react";
import { MdAltRoute, MdPublish } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { pushesResource } from "@plugins/tasks/core";
import { commitDeltaResource } from "@plugins/conversations/plugins/conversation-view/plugins/commits-graph/shared/resources";
import { convCommitsGraphPane } from "../panes";

export function CommitsChip() {
  const { conversation } = conversationPane.useData();
  const { data } = useResource(commitDeltaResource, {
    attemptId: conversation.attemptId,
  });
  const { data: pushes } = useResource(pushesResource);
  const pushCount = useMemo(
    () => pushes.filter((p) => p.attemptId === conversation.attemptId).length,
    [pushes, conversation.attemptId],
  );
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const isOpen =
    match?.chain.some((e) => e.pane === convCommitsGraphPane._internal) ?? false;

  // Hide the chip until we know there is a relationship with main. `null`
  // mergeBase means the worktree has no shared history (e.g. detached).
  if (data.mergeBase === null) return null;

  const ahead = data.ahead;
  const behind = data.behind;
  const branch = data.branch;

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
      onClick={() =>
        isOpen
          ? convCommitsGraphPane.close()
          : openPane(convCommitsGraphPane, { convId: conversation.id }, { mode: "push" })
      }
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
