import type { Attempt } from "@plugins/tasks/core";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";

/**
 * Single source of truth for Attempt status display metadata. Only the color
 * class is authored — the label is the mechanical sentence-case of the status
 * key (`in_progress` → "In progress"), derived via `formatStatusLabel` so it
 * cannot drift from the house casing rule.
 */
export const ATTEMPT_STATUS_META: Record<Attempt["status"], { badgeClassName: string }> = {
  pending: { badgeClassName: "bg-muted text-muted-foreground" },
  in_progress: { badgeClassName: "bg-info/15 text-info" },
  pushed: { badgeClassName: "bg-info/15 text-info" },
  completed: { badgeClassName: "bg-success/15 text-success" },
  abandoned: { badgeClassName: "bg-muted text-muted-foreground italic" },
};

export function AttemptStatusBadge({ status }: { status: Attempt["status"] }) {
  return (
    <Badge colorClass={ATTEMPT_STATUS_META[status].badgeClassName}>
      {formatStatusLabel(status)}
    </Badge>
  );
}
