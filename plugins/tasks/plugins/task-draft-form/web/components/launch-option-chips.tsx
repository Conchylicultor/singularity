import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  TaskLaunch,
  launchOptionValue,
  type LaunchOptionEntry,
  type LaunchOptionValues,
} from "@plugins/tasks/plugins/launch-options/web";

interface ChipsProps {
  values: LaunchOptionValues;
  onChange: (next: LaunchOptionValues) => void;
  disabled: boolean;
}

function LaunchOptionChip({
  option,
  values,
  onChange,
  disabled,
}: ChipsProps & { option: LaunchOptionEntry }) {
  const Control = option.component;
  return (
    <Stack direction="row" align="center" gap="xs">
      <Text as="span" variant="caption" tone="muted">
        {option.label}
      </Text>
      <Control
        value={launchOptionValue(values, option)}
        onChange={(next) => onChange({ ...values, [option.id]: next })}
        disabled={disabled}
      />
    </Stack>
  );
}

/**
 * The card's launch options, inline in its chip row. The same contributions the
 * task detail's Prompt card renders — this host just supplies the draft as
 * storage, so an option that only exists as a draft (no task yet) works
 * identically to one bound to a saved task.
 */
export function LaunchOptionChips(props: ChipsProps) {
  return (
    <TaskLaunch.Option.Render>
      {(option) => <LaunchOptionChip option={option} {...props} />}
    </TaskLaunch.Option.Render>
  );
}
