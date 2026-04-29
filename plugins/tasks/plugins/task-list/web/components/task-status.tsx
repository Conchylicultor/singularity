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
  { icon: IconType; className: string; label: string }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    className: "text-muted-foreground/60",
    label: "New",
  },
  in_progress: {
    icon: MdTimelapse,
    className: "text-blue-600 dark:text-blue-400",
    label: "In progress",
  },
  need_action: {
    icon: MdInput,
    className: "text-orange-500 dark:text-orange-400",
    label: "Need action",
  },
  attempted: {
    icon: MdIncompleteCircle,
    className: "text-muted-foreground",
    label: "Attempted",
  },
  done: {
    icon: MdCheckCircle,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Done",
  },
  held: {
    icon: MdPauseCircle,
    className: "text-amber-600 dark:text-amber-400",
    label: "Held",
  },
  dropped: {
    icon: MdCancel,
    className: "text-muted-foreground/50",
    label: "Dropped",
  },
  blocked: {
    icon: MdPauseCircle,
    className: "text-zinc-500 dark:text-zinc-400",
    label: "Blocked",
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
      <Icon className={cn("size-4", meta.className)} />
    </span>
  );
}
