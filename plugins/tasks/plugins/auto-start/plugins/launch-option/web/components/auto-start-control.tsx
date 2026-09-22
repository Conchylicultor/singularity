import type { ModelChoice } from "@plugins/conversations/plugins/model-provider/core";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * Picks the model this task auto-starts with (or `Off`). One select — each host
 * owns the label, so this paints nothing but the control.
 */
export function AutoStartLaunchControl({
  value,
  onChange,
  disabled,
}: LaunchControlProps<ModelChoice | null>) {
  return (
    <ModelSelect
      value={value}
      onChange={onChange}
      ariaLabel="Auto-start model"
      disabled={disabled}
    />
  );
}
