import {
  normalizeModel,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
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
}: LaunchControlProps<ConversationModel | null>) {
  return (
    <ModelSelect
      // A legacy/unknown stored model normalizes rather than showing as Off.
      value={value != null ? normalizeModel(value) : null}
      onChange={onChange}
      ariaLabel="Auto-start model"
      disabled={disabled}
    />
  );
}
