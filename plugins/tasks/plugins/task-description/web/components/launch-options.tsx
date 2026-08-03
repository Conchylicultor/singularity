import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { TaskPrompt, type TaskLaunchOption } from "../slots";

function LaunchOptionRow({
  option,
  taskId,
}: {
  option: TaskLaunchOption;
  taskId: string;
}) {
  const Control = option.component;
  return (
    <Stack direction="row" align="center" gap="md">
      <SectionLabel as="span">{option.label}</SectionLabel>
      <Control taskId={taskId} />
    </Stack>
  );
}

/**
 * The launch-option block beside the Launch button. The card paints the label
 * column and the row rhythm; each contribution paints only its control, so
 * adding an option is one contribution and no layout.
 */
export function LaunchOptions({ taskId }: { taskId: string }) {
  return (
    <Stack gap="sm">
      <TaskPrompt.LaunchOption.Render>
        {(option) => <LaunchOptionRow option={option} taskId={taskId} />}
      </TaskPrompt.LaunchOption.Render>
    </Stack>
  );
}
