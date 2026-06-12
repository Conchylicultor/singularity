import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import {
  MdCancel,
  MdCheckCircle,
  MdIncompleteCircle,
  MdInput,
  MdPauseCircle,
  MdRadioButtonUnchecked,
  MdTimelapse,
} from "react-icons/md";
import type { IconType } from "react-icons";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/text/web";

/**
 * States that warrant a colored filled badge (they need the user's attention).
 * Everything else is a neutral at-rest signal rendered as a quiet StatusDot +
 * muted label. Single source of truth so call sites never re-derive this.
 */
const ATTENTION_STATUSES = new Set<TaskStatus>(["need_action", "held"]);

export const STATUS_META: Record<
  TaskStatus,
  {
    icon: IconType;
    iconClassName: string;
    label: string;
    badgeClassName: string;
    /** Background color class for the at-rest StatusDot read-signal. */
    dotClass: string;
  }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    iconClassName: "text-muted-foreground/60",
    label: "New",
    badgeClassName: "bg-muted",
    dotClass: "bg-muted-foreground/40",
  },
  in_progress: {
    icon: MdTimelapse,
    iconClassName: "text-info",
    label: "In progress",
    badgeClassName: "bg-muted",
    dotClass: "bg-info",
  },
  need_action: {
    icon: MdInput,
    iconClassName: "text-warning",
    label: "Need action",
    badgeClassName: "bg-warning/15 text-warning",
    dotClass: "bg-warning",
  },
  attempted: {
    icon: MdIncompleteCircle,
    iconClassName: "text-muted-foreground",
    label: "Attempted",
    badgeClassName: "bg-muted",
    dotClass: "bg-muted-foreground/60",
  },
  done: {
    icon: MdCheckCircle,
    iconClassName: "text-success",
    label: "Done",
    badgeClassName: "bg-muted",
    dotClass: "bg-success",
  },
  held: {
    icon: MdPauseCircle,
    iconClassName: "text-warning",
    label: "Held",
    badgeClassName: "bg-warning/15 text-warning",
    dotClass: "bg-warning",
  },
  dropped: {
    icon: MdCancel,
    iconClassName: "text-muted-foreground/50",
    label: "Dropped",
    badgeClassName: "bg-muted text-muted-foreground/60 italic",
    dotClass: "bg-muted-foreground/40",
  },
  blocked: {
    icon: MdPauseCircle,
    iconClassName: "text-muted-foreground",
    label: "Blocked",
    badgeClassName: "bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground/60",
  },
};

export function StatusIcon({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="flex size-5 shrink-0 items-center justify-center"
    >
      <Icon className={cn("size-4", meta.iconClassName)} />
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge colorClass={meta.badgeClassName}>
      {meta.label}
    </Badge>
  );
}

/**
 * Status as a read-signal with proper emphasis tiers: a colored filled badge
 * only for attention states (need_action / held); every neutral state recedes
 * to a quiet StatusDot + muted label. Color is reserved for what needs action.
 */
export function StatusSignal({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  if (ATTENTION_STATUSES.has(status)) {
    return <StatusBadge status={status} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot colorClass={meta.dotClass} />
      <Text variant="caption" tone="muted">{meta.label}</Text>
    </span>
  );
}
