import {
  ElapsedTime,
  formatElapsed,
} from "@plugins/primitives/plugins/relative-time/web";

/**
 * How long a sub-agent has been going, or how long it took.
 *
 * ONE component for both readings, so a card and the pane it opens can never
 * show the same sub-agent two different durations. While it runs this is a live
 * clock; once it has stopped it freezes at the total.
 */
export function SubagentDuration({
  startedAt,
  endedAt,
  className,
}: {
  startedAt: Date | null;
  /** `null` while it is still running. */
  endedAt: Date | null;
  className?: string;
}) {
  if (startedAt === null) return null;
  if (endedAt === null) {
    return <ElapsedTime since={startedAt} className={className} />;
  }
  return (
    <span className={className}>
      {formatElapsed(endedAt.getTime() - startedAt.getTime())}
    </span>
  );
}
