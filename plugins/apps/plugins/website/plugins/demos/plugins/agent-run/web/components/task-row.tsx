import {
  MdCheck,
  MdCheckCircle,
  MdRadioButtonUnchecked,
} from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { DemoTask, RunState } from "./constants";
import { StageTimeline } from "./stage-timeline";

/** Leading status glyph — an empty circle when idle/running (the timeline shows progress), a filled check when merged. */
function StatusIcon({ status }: { status: RunState["status"] }) {
  if (status === "done") {
    return <MdCheckCircle className="size-4 text-success" aria-hidden />;
  }
  return (
    <MdRadioButtonUnchecked
      className="size-4 text-muted-foreground"
      aria-hidden
    />
  );
}

/**
 * One task in the demo list: a title with a status glyph, a Launch agent button
 * (idle) that flips to a Merged badge (done) and is disabled mid-run, the inline
 * stage timeline while running, and — for the flagged task — two subtask lines
 * that check off as the run passes the edit and merge stages.
 */
export function TaskRow({
  task,
  run,
  onLaunch,
}: {
  task: DemoTask;
  run: RunState;
  onLaunch: () => void;
}) {
  const running = run.status === "running";
  const done = run.status === "done";

  return (
    <Stack gap="sm">
      <Stack direction="row" gap="md" align="center" justify="between">
        <Stack direction="row" gap="sm" align="center">
          <StatusIcon status={run.status} />
          <Text
            variant="label"
            tone={done ? "muted" : "default"}
            className={done ? "line-through" : undefined}
          >
            {task.title}
          </Text>
        </Stack>
        {done ? (
          <Badge variant="success" icon={<MdCheck />}>
            Merged
          </Badge>
        ) : (
          <Button
            variant="outline"
            disabled={running}
            onClick={onLaunch}
            aria-label={`Launch agent: ${task.title}`}
          >
            Launch agent
          </Button>
        )}
      </Stack>

      {running && <StageTimeline stage={run.stage} />}

      {task.subtasks && (
        <Inset l="lg">
          <Stack gap="2xs">
            <SubtaskRow
              label={task.subtasks[0]}
              checked={done || run.stage >= 2}
            />
            <SubtaskRow label={task.subtasks[1]} checked={done} />
          </Stack>
        </Inset>
      )}
    </Stack>
  );
}

function SubtaskRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <Stack direction="row" gap="xs" align="center">
      <CheckboxIndicator checked={checked} />
      <Text
        variant="caption"
        tone="muted"
        className={checked ? "line-through" : undefined}
      >
        {label}
      </Text>
    </Stack>
  );
}
