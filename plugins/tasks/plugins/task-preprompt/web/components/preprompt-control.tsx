import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * One select — each host owns the label, so nothing here restates it (the
 * former section body carried a caption saying what the label already says).
 */
export function PrepromptLaunchControl({
  value,
  onChange,
  disabled,
}: LaunchControlProps<string | null>) {
  return (
    <PrepromptSelect
      value={value}
      onChange={onChange}
      ariaLabel="Task preprompt"
      disabled={disabled}
    />
  );
}
