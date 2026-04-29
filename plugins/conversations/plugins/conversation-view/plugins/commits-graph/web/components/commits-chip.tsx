import { MdAltRoute } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { commitDeltaResource } from "../../shared/resources";
import { convCommitsGraphPane } from "../panes";

export function CommitsChip() {
  const { conversation } = conversationPane.useData();
  const { data } = useResource(commitDeltaResource, {
    attemptId: conversation.attemptId,
  });
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convCommitsGraphPane._internal) ?? false;

  // Hide the chip until we know there is a relationship with main. `null`
  // mergeBase means the worktree has no shared history (e.g. detached).
  if (data && data.mergeBase === null) return null;

  const ahead = data?.ahead ?? 0;
  const behind = data?.behind ?? 0;
  const branch = data?.branch ?? null;

  const title = branch
    ? `${branch}: ${ahead} ahead, ${behind} behind main`
    : `${ahead} ahead, ${behind} behind main`;

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
          : convCommitsGraphPane.open({ convId: conversation.id })
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
    </Button>
  );
}
