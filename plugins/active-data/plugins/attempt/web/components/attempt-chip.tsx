import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import { attemptPane } from "@plugins/attempt-view/web";
import { attemptsResource } from "@plugins/tasks/core";
import type { AttemptStatus } from "@plugins/tasks-core/core";

const ATTEMPT_STATUS_DOT: Record<AttemptStatus, string> = {
  pending: "bg-muted-foreground/60",
  in_progress: "bg-info",
  pushed: "bg-success",
  completed: "bg-categorical-5",
  abandoned: "bg-muted-foreground/40",
};

export function AttemptChip({ content }: { content: string; attrs: Record<string, string> }) {
  const attemptId = content.trim();
  const result = useResource(attemptsResource);
  const openPane = useOpenPane();
  const attempt = useMemo(
    () => (result.pending ? null : result.data.find((a) => a.id === attemptId) ?? null),
    [result, attemptId],
  );

  if (!attemptId) return null;

  const statusClass = attempt
    ? ATTEMPT_STATUS_DOT[attempt.status]
    : "bg-muted-foreground/40";

  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        openPane(attemptPane, { attemptId }, { mode: "push", side: "left" });
      }}
      title={attempt ? `${attempt.status} · ${attemptId}` : attemptId}
      leading={<StatusDot colorClass={statusClass} />}
      mono
    >
      {attemptId}
      {attempt && attempt.conversations.length > 0 && (
        <span className="text-muted-foreground/70">{attempt.conversations.length}</span>
      )}
    </LinkChip>
  );
}
