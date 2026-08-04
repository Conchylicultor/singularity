import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  TaskLaunch,
  type LaunchOptionEntry,
} from "@plugins/tasks/plugins/launch-options/web";

/**
 * Resolves the contribution's `useTaskBinding` hook. Its own component so the
 * hook is called unconditionally — the branch below is on the hook's presence,
 * which is stable per contribution.
 */
function BoundOptionRow({
  option,
  taskId,
  useTaskBinding,
}: {
  option: LaunchOptionEntry;
  taskId: string;
  useTaskBinding: NonNullable<LaunchOptionEntry["useTaskBinding"]>;
}) {
  const { value, onChange } = useTaskBinding(taskId);
  const Control = option.component;
  return (
    <Stack direction="row" align="center" gap="md">
      <SectionLabel as="span">{option.label}</SectionLabel>
      <Control value={value} onChange={onChange} />
    </Stack>
  );
}

function LaunchOptionRow({
  option,
  taskId,
}: {
  option: LaunchOptionEntry;
  taskId: string;
}) {
  // No binding ⇒ the option has no storage on an existing task: it is
  // draft-only, and this surface paints nothing for it.
  if (!option.useTaskBinding) return null;
  return (
    <BoundOptionRow
      option={option}
      taskId={taskId}
      useTaskBinding={option.useTaskBinding}
    />
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
      <TaskLaunch.Option.Render>
        {(option) => <LaunchOptionRow option={option} taskId={taskId} />}
      </TaskLaunch.Option.Render>
    </Stack>
  );
}
