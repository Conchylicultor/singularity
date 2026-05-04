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
import type { TaskStatus } from "@plugins/tasks-core/shared";
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
    iconClassName: "text-blue-600 dark:text-blue-400",
    label: "In progress",
    badgeClassName: "bg-muted",
  },
  need_action: {
    icon: MdInput,
    iconClassName: "text-orange-500 dark:text-orange-400",
    label: "Need action",
    badgeClassName: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  attempted: {
    icon: MdIncompleteCircle,
    iconClassName: "text-muted-foreground",
    label: "Attempted",
    badgeClassName: "bg-muted",
  },
  done: {
    icon: MdCheckCircle,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    label: "Done",
    badgeClassName: "bg-muted",
  },
  held: {
    icon: MdPauseCircle,
    iconClassName: "text-amber-600 dark:text-amber-400",
    label: "Held",
    badgeClassName: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  dropped: {
    icon: MdCancel,
    iconClassName: "text-muted-foreground/50",
    label: "Dropped",
    badgeClassName: "bg-muted text-muted-foreground/60 italic",
  },
  blocked: {
    icon: MdPauseCircle,
    iconClassName: "text-zinc-500 dark:text-zinc-400",
    label: "Blocked",
    badgeClassName: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
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
