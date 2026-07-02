import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";

/**
 * A single explicit checkbox operand: ticked → the filter matches `true`,
 * unticked → `false` (the default). Replaces the former "Unchecked / Checked"
 * text toggle with a direct checkbox, so the rule reads "<field> Is ☑" the way a
 * boolean naturally renders. Uses the sanctioned native `<input type="checkbox">`
 * (accent-primary, keyboard-accessible, native a11y), left-aligned right after
 * the operator and vertically centered to the `control-sm` height so it lines up
 * with the adjacent field / operator pickers.
 */
export function BoolValueInput(props: FilterValueInputProps): ReactNode {
  const checked = props.value === true;
  return (
    <Stack direction="row" gap="none" align="center" className="h-(--control-height-sm)">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => props.onChange(e.target.checked)}
        aria-label={checked ? "Checked" : "Unchecked"}
        className="size-4 cursor-pointer accent-primary"
      />
    </Stack>
  );
}
