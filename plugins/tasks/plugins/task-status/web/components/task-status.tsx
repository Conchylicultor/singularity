import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";

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
    iconClassName: ClassName;
    label: string;
    badgeClassName: ClassName;
    /** Background color class for the at-rest StatusDot read-signal. */
    dotClass: string;
  }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    iconClassName: cn("text-muted-foreground/60"),
    label: "New",
    badgeClassName: cn("bg-muted"),
    dotClass: "bg-muted-foreground/40",
  },
  in_progress: {
    icon: MdTimelapse,
    iconClassName: cn("text-info"),
    label: "In progress",
    badgeClassName: cn("bg-muted"),
    dotClass: "bg-info",
  },
  need_action: {
    icon: MdInput,
    iconClassName: cn("text-warning"),
    label: "Need action",
    badgeClassName: cn("bg-warning/15 text-warning"),
    dotClass: "bg-warning",
  },
  attempted: {
    icon: MdIncompleteCircle,
    iconClassName: cn("text-muted-foreground"),
    label: "Attempted",
    badgeClassName: cn("bg-muted"),
    dotClass: "bg-muted-foreground/60",
  },
  done: {
    icon: MdCheckCircle,
    iconClassName: cn("text-success"),
    label: "Done",
    badgeClassName: cn("bg-muted"),
    dotClass: "bg-success",
  },
  held: {
    icon: MdPauseCircle,
    iconClassName: cn("text-warning"),
    label: "Held",
    badgeClassName: cn("bg-warning/15 text-warning"),
    dotClass: "bg-warning",
  },
  dropped: {
    icon: MdCancel,
    iconClassName: cn("text-muted-foreground/50"),
    label: "Dropped",
    badgeClassName: cn("bg-muted text-muted-foreground/60 italic"),
    dotClass: "bg-muted-foreground/40",
  },
  blocked: {
    icon: MdPauseCircle,
    iconClassName: cn("text-muted-foreground"),
    label: "Blocked",
    badgeClassName: cn("bg-muted text-muted-foreground"),
    dotClass: "bg-muted-foreground/60",
  },
  // Same blocked task, with an agent running on it. Carries the running colour
  // (info) so the live attempt is visible at a glance, and says so in the label
  // rather than reading as a plain `Blocked` row nothing is happening on.
  in_progress_blocked: {
    icon: MdTimelapse,
    iconClassName: cn("text-info"),
    label: "In progress (blocked)",
    badgeClassName: cn("bg-muted"),
    dotClass: "bg-info",
  },
};

export function StatusIcon({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Center
      as="span"
      title={meta.label}
      aria-label={meta.label}
      className={cn("size-5", rigidClass())}
    >
      <Icon className={cn("size-4", meta.iconClassName)} />
    </Center>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return <Badge colorClass={meta.badgeClassName}>{meta.label}</Badge>;
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
    <Inline gap="xs">
      <StatusDot colorClass={meta.dotClass} />
      <Text variant="caption" tone="muted">
        {meta.label}
      </Text>
    </Inline>
  );
}
