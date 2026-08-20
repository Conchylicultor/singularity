import type { Attempt } from "@plugins/tasks/plugins/tasks-core/core";
import {
  Badge,
  formatStatusLabel,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Single source of truth for Attempt status display metadata — the badge tint AND
 * the dot tint, so a chip and a badge for the same attempt can never disagree
 * about it. Mirrors `task-status`'s STATUS_META, which carries both for the same
 * reason. Only the colors are authored — the label is the sentence-case of the status
 * key (`in_progress` → "In progress"), derived via `formatStatusLabel` so it
 * cannot drift from the house casing rule.
 *
 * NO STATUS EDITORIALISES. Each one names a fact the attempt's row proves
 * (invariant I6, `tasks-core/server/internal/views.ts`), so the styling reports
 * that fact and nothing more. Only `completed` earns colour, because it is the
 * only arm making a positive claim the user is waiting on — the rest recede,
 * matching `task-status`'s "colour is reserved for what needs action".
 *
 * In particular `closed` is NOT struck out or italicised. Its predecessor
 * `abandoned` was (`text-muted-foreground italic`), and that styling is exactly
 * what made an ordinary finished session — 1012 of them — read as dead work,
 * including sessions whose commits had landed on a commit the ledger cannot
 * attribute. A neutral end state gets neutral type.
 */
export const ATTEMPT_STATUS_META: Record<
  Attempt["status"],
  { badgeClassName: ClassName; dotClass: string }
> = {
  pending: {
    badgeClassName: cn("bg-muted text-muted-foreground"),
    dotClass: "bg-muted-foreground/40",
  },
  in_progress: {
    badgeClassName: cn("bg-info/15 text-info"),
    dotClass: "bg-info",
  },
  pushed: { badgeClassName: cn("bg-info/15 text-info"), dotClass: "bg-info" },
  completed: {
    badgeClassName: cn("bg-success/15 text-success"),
    dotClass: "bg-success",
  },
  // The process is not running but the attempt is resumable (a `gone`
  // conversation, usually hibernation). Deliberately not warning-coloured:
  // hibernating an idle pane is routine, and a tint here would cry wolf on it.
  dormant: {
    badgeClassName: cn("bg-muted text-muted-foreground"),
    dotClass: "bg-muted-foreground/40",
  },
  closed: {
    badgeClassName: cn("bg-muted text-muted-foreground"),
    dotClass: "bg-muted-foreground/40",
  },
};

/** The badge's wording, for surfaces that show the status as text (tooltips). */
export const attemptStatusLabel = (status: Attempt["status"]): string =>
  formatStatusLabel(status);

export function AttemptStatusBadge({ status }: { status: Attempt["status"] }) {
  return (
    <Badge colorClass={ATTEMPT_STATUS_META[status].badgeClassName}>
      {formatStatusLabel(status)}
    </Badge>
  );
}
