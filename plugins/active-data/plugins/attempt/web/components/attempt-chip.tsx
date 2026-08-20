import {
  useResource,
  matchResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
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

export function AttemptChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const attemptId = content.trim();
  const result = useResource(attemptsResource);
  const openPane = useOpenPane();

  if (!attemptId) return null;

  // While pending, render the degraded raw-id chip so it never disappears.
  return matchResource(result, {
    pending: () => (
      <LinkChip
        onClick={(e) => {
          e.stopPropagation();
          openPane(attemptPane, { attemptId }, { mode: "push", side: "left" });
        }}
        title={attemptId}
        leading={<StatusDot colorClass={UNKNOWN_DOT} />}
        mono
      >
        {attemptId}
      </LinkChip>
    ),
    ready: (data) => {
      const attempt = data.find((a) => a.id === attemptId) ?? null;
      const statusClass = attempt
        ? ATTEMPT_STATUS_META[attempt.status].dotClass
        : UNKNOWN_DOT;
      return (
        <LinkChip
          onClick={(e) => {
            e.stopPropagation();
            openPane(
              attemptPane,
              { attemptId },
              { mode: "push", side: "left" },
            );
          }}
          title={
            attempt
              ? `${attemptStatusLabel(attempt.status)} · ${attemptId}`
              : attemptId
          }
          leading={<StatusDot colorClass={statusClass} />}
          mono
        >
          {attemptId}
          {attempt && attempt.conversations.length > 0 && (
            <span className="text-muted-foreground/70">
              {attempt.conversations.length}
            </span>
          )}
        </LinkChip>
      );
    },
  });
}
