import type { Attempt } from "@plugins/tasks/plugins/tasks-core/core";
import {
  Badge,
  formatStatusLabel,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Single source of truth for Attempt status display metadata. Only the color
 * class is authored — the label is the mechanical sentence-case of the status
 * key (`in_progress` → "In progress"), derived via `formatStatusLabel` so it
 * cannot drift from the house casing rule.
 */
export const ATTEMPT_STATUS_META: Record<
  Attempt["status"],
  { badgeClassName: ClassName }
> = {
  pending: { badgeClassName: cn("bg-muted text-muted-foreground") },
  in_progress: { badgeClassName: cn("bg-info/15 text-info") },
  pushed: { badgeClassName: cn("bg-info/15 text-info") },
  completed: { badgeClassName: cn("bg-success/15 text-success") },
  abandoned: { badgeClassName: cn("bg-muted text-muted-foreground italic") },
};

export function AttemptStatusBadge({ status }: { status: Attempt["status"] }) {
  return (
    <Badge colorClass={ATTEMPT_STATUS_META[status].badgeClassName}>
      {formatStatusLabel(status)}
    </Badge>
  );
}
