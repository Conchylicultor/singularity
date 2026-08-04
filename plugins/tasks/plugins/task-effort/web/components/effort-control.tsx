import { EffortSelect } from "@plugins/conversations/plugins/effort-provider/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * One select — each host owns the label, so nothing here restates it (the
 * former section body carried a caption saying what the label already says).
 */
export function EffortLaunchControl({
  value,
  onChange,
  disabled,
}: LaunchControlProps<EffortLevel | null>) {
  return (
    <EffortSelect
      value={value}
      onChange={onChange}
      ariaLabel="Task thinking mode"
      disabled={disabled}
    />
  );
}
