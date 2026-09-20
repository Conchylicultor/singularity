import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import { effortItems } from "@plugins/conversations/plugins/effort-provider/web";
import {
  EFFORT_REGISTRY,
  EFFORT_UNSET_LABEL,
  type EffortLevel,
} from "@plugins/conversations/plugins/effort-provider/core";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * The chosen thinking mode as the pill's text. Never rendered while no mode is
 * picked — there the bar paints the option's `unsetLabel` (or, on a solo pill,
 * its placeholder) instead — so this only ever sees a level the user picked.
 */
export function EffortPillValue({ value }: { value: EffortLevel }) {
  return <>{EFFORT_REGISTRY[value].label}</>;
}

/** The menu rows: `Auto` (Claude Code's own default) and every level. */
export function EffortPillMenu({
  value,
  onChange,
  disabled,
}: LaunchControlProps<EffortLevel | null>) {
  return (
    <>
      <PickerPill.Item
        selected={value == null}
        onSelect={() => onChange(null)}
        disabled={disabled}
      >
        {EFFORT_UNSET_LABEL}
      </PickerPill.Item>
      {effortItems().map((item) => (
        <PickerPill.Item
          key={item.value}
          selected={value === item.value}
          onSelect={() => onChange(item.value)}
          disabled={disabled}
        >
          {item.label}
        </PickerPill.Item>
      ))}
    </>
  );
}
