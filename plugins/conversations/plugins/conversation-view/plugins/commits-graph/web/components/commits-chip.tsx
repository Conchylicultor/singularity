import { MdAltRoute, MdPublish } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { pushesByAttemptResource } from "@plugins/tasks/plugins/tasks-core/core";
import { commitDeltaResource } from "../../shared/resources";
import { convCommitsGraphPane } from "../panes";

export function CommitsChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const deltaResult = useResource(commitDeltaResource, {
    attemptId: conversation?.attemptId ?? "",
  });
  const pushesResult = useResource(pushesByAttemptResource, {
    attemptId: conversation?.attemptId ?? "",
  });
  const { isOpen, toggle } = convCommitsGraphPane.useToggle({});

  if (deltaResult.pending) return null;
  if (pushesResult.pending) return null;

  const delta = deltaResult.data;
  // No worktree to measure ⇒ a determinate non-value. Show a muted `—` with the
  // reason as its tooltip — never a confident "0 ahead" about a branch nobody
  // measured.
  if (!delta.resolved) {
    return (
      <Button
        variant={isOpen ? "secondary" : "ghost"}
        title={delta.reason}
        aria-label={delta.reason}
        aria-pressed={isOpen}
        onClick={toggle}
        className="gap-xs px-sm text-caption tabular-nums"
      >
        <MdAltRoute className="size-4" />
        <span className="text-muted-foreground">—</span>
      </Button>
    );
  }
  if (delta.value.mergeBase === null) return null;

  const pushCount = pushesResult.data.length;
  const ahead = delta.value.ahead;
  const behind = delta.value.behind;
  const branch = delta.value.branch;

  const parts = [
    `${ahead} ahead`,
    behind > 0 ? `${behind} behind main` : "main",
    pushCount > 0 ? `${pushCount} push${pushCount !== 1 ? "es" : ""}` : null,
  ].filter(Boolean);
  const title = branch ? `${branch}: ${parts.join(", ")}` : parts.join(", ");

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title={title}
      aria-label={title}
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-xs px-sm text-caption tabular-nums"
    >
      <MdAltRoute className="size-4" />
      <span className="text-muted-foreground">↑</span>
      <span className="text-muted-foreground">{ahead}</span>
      {behind > 0 ? (
        <>
          <span className="text-muted-foreground">↓</span>
          <span className="text-warning">{behind}</span>
        </>
      ) : null}
      {pushCount > 0 ? (
        <>
          <span className="text-muted-foreground">·</span>
          <MdPublish className={`size-3.5 ${behind > 0 ? "text-muted-foreground" : "text-success"}`} />
          <span className={behind > 0 ? "text-muted-foreground" : "text-success"}>{pushCount}</span>
        </>
      ) : null}
    </Button>
  );
}
