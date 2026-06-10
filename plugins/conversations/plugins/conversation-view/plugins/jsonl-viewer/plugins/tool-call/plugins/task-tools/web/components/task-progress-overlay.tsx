import { useState } from "react";
import {
  MdRadioButtonUnchecked,
  MdTimelapse,
  MdCheckCircle,
  MdCancel,
  MdStopCircle,
  MdExpandMore,
  MdExpandLess,
  MdClose,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useTaskAggregate, type TaskEntry } from "./use-task-aggregate";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "in_progress":
      return <MdTimelapse className="size-4 shrink-0 text-info" />;
    case "completed":
      return <MdCheckCircle className="size-4 shrink-0 text-success" />;
    case "failed":
      return <MdCancel className="size-4 shrink-0 text-destructive" />;
    case "stopped":
      return <MdStopCircle className="size-4 shrink-0 text-muted-foreground" />;
    default:
      return <MdRadioButtonUnchecked className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function TaskRow({ task }: { task: TaskEntry }) {
  return (
    <Text as="div" variant="caption" className="flex items-center gap-2 px-3 py-1">
      <StatusIcon status={task.status} />
      <span className="min-w-0 flex-1 truncate text-foreground/80">
        {task.description}
      </span>
      <span className="shrink-0 font-mono text-3xs text-muted-foreground/60">
        {task.taskId.slice(0, 8)}
      </span>
    </Text>
  );
}

export function TaskProgressOverlay() {
  const { tasks, completedCount, totalCount, shouldShow } = useTaskAggregate();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (!shouldShow || dismissed) return null;

  return (
    <div className="absolute inset-x-0 bottom-10 z-float flex justify-center pointer-events-none">
      <div className="pointer-events-auto mx-4 w-full max-w-sm rounded-lg border bg-background/90 shadow-sm backdrop-blur-sm">
        <div className="flex items-center px-3 py-2">
          <Text as="span" variant="caption" className="tabular-nums text-muted-foreground">
            {completedCount}/{totalCount} complete
          </Text>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {expanded ? (
                <MdExpandMore className="size-4" />
              ) : (
                <MdExpandLess className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MdClose className="size-4" />
            </button>
          </div>
        </div>
        {expanded && tasks.length > 0 && (
          <div className="max-h-[180px] overflow-y-auto border-t border-border/40 py-1">
            {tasks.map((task) => (
              <TaskRow key={task.taskId} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
