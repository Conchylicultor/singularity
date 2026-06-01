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
import type { TaskStatus } from "@plugins/tasks-core/core";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  TaskStatus,
  { icon: IconType; iconClassName: string; label: string; badgeClassName: string }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    iconClassName: "text-muted-foreground/60",
    label: "New",
    badgeClassName: "bg-muted",
  },
  in_progress: {
    icon: MdTimelapse,
    iconClassName: "text-info",
    label: "In progress",
    badgeClassName: "bg-muted",
  },
  need_action: {
    icon: MdInput,
    iconClassName: "text-warning",
    label: "Need action",
    badgeClassName: "bg-warning/15 text-warning",
  },
  attempted: {
    icon: MdIncompleteCircle,
    iconClassName: "text-muted-foreground",
    label: "Attempted",
    badgeClassName: "bg-muted",
  },
  done: {
    icon: MdCheckCircle,
    iconClassName: "text-success",
    label: "Done",
    badgeClassName: "bg-muted",
  },
  held: {
    icon: MdPauseCircle,
    iconClassName: "text-warning",
    label: "Held",
    badgeClassName: "bg-warning/15 text-warning",
  },
  dropped: {
    icon: MdCancel,
    iconClassName: "text-muted-foreground/50",
    label: "Dropped",
    badgeClassName: "bg-muted text-muted-foreground/60 italic",
  },
  blocked: {
    icon: MdPauseCircle,
    iconClassName: "text-muted-foreground",
    label: "Blocked",
    badgeClassName: "bg-muted text-muted-foreground",
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
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", meta.badgeClassName)}>
      {meta.label}
    </span>
  );
}
