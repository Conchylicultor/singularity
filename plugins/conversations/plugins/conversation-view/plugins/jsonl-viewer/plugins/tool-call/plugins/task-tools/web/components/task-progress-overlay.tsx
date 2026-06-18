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
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useTaskAggregate, type TaskEntry } from "./use-task-aggregate";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "in_progress":
      return <MdTimelapse className="size-4 text-info" />;
    case "completed":
      return <MdCheckCircle className="size-4 text-success" />;
    case "failed":
      return <MdCancel className="size-4 text-destructive" />;
    case "stopped":
      return <MdStopCircle className="size-4 text-muted-foreground" />;
    default:
      return <MdRadioButtonUnchecked className="size-4 text-muted-foreground" />;
  }
}

function TaskRow({ task }: { task: TaskEntry }) {
  return (
    <Frame
      gap="sm"
      className="px-md py-xs"
      leading={<StatusIcon status={task.status} />}
      content={
        <Text as="span" variant="caption" className="truncate text-foreground/80">
          {task.description}
        </Text>
      }
      trailing={
        <span className="font-mono text-3xs text-muted-foreground/60">
          {task.taskId.slice(0, 8)}
        </span>
      }
    />
  );
}

export function TaskProgressOverlay() {
  const { tasks, completedCount, totalCount, shouldShow } = useTaskAggregate();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (!shouldShow || dismissed) return null;

  return (
    <Pin
      to="bottom"
      stretch
      decorative
      layer="float"
      // bottom-10 (2.5rem) is off the spacing ramp, so override Pin's flush inset.
      style={{ bottom: "2.5rem" }}
    >
      <Center axis="horizontal">
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mx-4 gutters the centered card; can't fold into the parent without breaking the centered max-width */}
        <div className="pointer-events-auto mx-4 w-full max-w-sm rounded-lg border bg-background/90 shadow-sm backdrop-blur-sm">
          <Frame
            gap="xs"
            className="px-md py-sm"
            content={
              <Text as="span" variant="caption" className="tabular-nums text-muted-foreground">
                {completedCount}/{totalCount} complete
              </Text>
            }
            trailing={
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="rounded-md p-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
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
                  className="rounded-md p-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MdClose className="size-4" />
                </button>
              </>
            }
          />
          {expanded && tasks.length > 0 && (
            <Scroll className="max-h-[180px] border-t border-border/40 py-xs">
              {tasks.map((task) => (
                <TaskRow key={task.taskId} task={task} />
              ))}
            </Scroll>
          )}
        </div>
      </Center>
    </Pin>
  );
}
