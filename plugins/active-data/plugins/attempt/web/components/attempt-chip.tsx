import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { attemptPane } from "@plugins/attempt-view/web";
import { attemptsResource } from "@plugins/tasks/shared";
import type { AttemptStatus } from "@plugins/tasks-core/shared";

const ATTEMPT_STATUS_DOT: Record<AttemptStatus, string> = {
  pending: "bg-muted-foreground/60",
  in_progress: "bg-[oklch(0.58_0.1_240)]",
  pushed: "bg-green-500",
  completed: "bg-purple-500/70",
  abandoned: "bg-muted-foreground/40",
};

export function AttemptChip({ content }: { content: string; attrs: Record<string, string> }) {
  const attemptId = content.trim();
  const { data } = useResource(attemptsResource);
  const attempt = useMemo(
    () => data?.find((a) => a.id === attemptId) ?? null,
    [data, attemptId],
  );

  if (!attemptId) return null;

  const statusClass = attempt
    ? ATTEMPT_STATUS_DOT[attempt.status]
    : "bg-muted-foreground/40";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        attemptPane.open({ attemptId });
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={attempt ? `${attempt.status} · ${attemptId}` : attemptId}
    >
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${statusClass}`} />
      <span className="truncate font-mono">{attemptId}</span>
      {attempt && attempt.conversations.length > 0 && (
        <span className="text-muted-foreground/70">{attempt.conversations.length}</span>
      )}
    </button>
  );
}
