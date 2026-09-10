import {
  useResource,
  matchResource,
  useCombinedResources,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { useConversationOpener } from "@plugins/conversations/plugins/conversation-view/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import {
  attemptsResource,
  tasksResource,
  type AttemptWithConversations,
  type ConversationSummary,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  ATTEMPT_STATUS_META,
  attemptStatusLabel,
} from "@plugins/tasks/plugins/attempt-status/web";

// The dot tint and its wording come from attempt-status, the one owner of
// AttemptStatus display metadata. This chip used to author its own map, which
// had drifted: it painted `pushed` as success and `completed` as categorical-5
// while the badge painted them info and success — so the same attempt told two
// different stories depending on which surface you were looking at.
const UNKNOWN_DOT = "bg-muted-foreground/40";

/** The conversation the attempt was launched with — the earliest one. */
function firstConversation(
  attempt: AttemptWithConversations,
): ConversationSummary | undefined {
  let first: ConversationSummary | undefined;
  for (const c of attempt.conversations) {
    if (!first || c.createdAt < first.createdAt) first = c;
  }
  return first;
}

export function AttemptChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const attemptId = content.trim();
  const result = useCombinedResources({
    attempts: useResource(attemptsResource),
    tasks: useResource(tasksResource),
  });
  const openPane = useOpenPane();
  const opener = useConversationOpener();

  if (!attemptId) return null;

  // Most attempts hold a single conversation, so the chip goes straight to
  // the first one instead of stopping at the attempt pane's list of one. The
  // attempt pane stays the target only when there is no conversation to open.
  // Either way it is a regular push to the right, like every other chip —
  // opening the attempt pane on the LEFT of a conversation is the
  // conversation toolbar's attempt-switch toggle alone.
  const open = (convId: string | undefined) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (convId) opener.toggle(convId);
    else openPane(attemptPane, { attemptId }, { mode: "push" });
  };

  // The degraded raw-id chip: shown while loading, and for an attempt the
  // index doesn't hold, so the chip never disappears.
  const rawChip = (
    <LinkChip
      onClick={open(undefined)}
      title={attemptId}
      leading={<StatusDot colorClass={UNKNOWN_DOT} />}
      mono
    >
      {attemptId}
    </LinkChip>
  );

  return matchResource(result, {
    pending: () => rawChip,
    ready: ({ attempts, tasks }) => {
      const attempt = attempts.find((a) => a.id === attemptId);
      if (!attempt) return rawChip;
      const conv = firstConversation(attempt);
      // Named after the conversation it opens; the task title covers the
      // window before that conversation has a title (or when it has none).
      const name =
        conv?.title?.trim() ||
        tasks.find((t) => t.id === attempt.taskId)?.title.trim() ||
        undefined;
      const count = attempt.conversations.length;
      return (
        <LinkChip
          onClick={open(conv?.id)}
          title={[name, attemptStatusLabel(attempt.status), attemptId]
            .filter(Boolean)
            .join(" · ")}
          leading={
            <StatusDot
              colorClass={ATTEMPT_STATUS_META[attempt.status].dotClass}
            />
          }
          mono={!name}
        >
          {name ?? attemptId}
          {count > 1 && (
            <span className="text-muted-foreground/70">{count}</span>
          )}
        </LinkChip>
      );
    },
  });
}
