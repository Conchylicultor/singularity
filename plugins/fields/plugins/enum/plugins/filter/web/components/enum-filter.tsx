import type { ReactNode } from "react";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";

/** Single-select option chips (operand is one option value) for is / is-not. */
export function EnumSingleInput(props: FilterValueInputProps): ReactNode {
  const selected = typeof props.value === "string" ? props.value : "";
  const options = props.field.options ?? [];
  return (
    <Stack direction="row" gap="xs" align="center" wrap>
      {options.map((o) => (
        <ToggleChip
          key={o.value}
          active={selected === o.value}
          variant="ghost"
          size="sm"
          onClick={() =>
            props.onChange(selected === o.value ? undefined : o.value)
          }
        >
          {o.label}
        </ToggleChip>
      ))}
    </Stack>
  );
}

/** Multi-select option chips (operand is a string[]) for is-any-of / is-none-of. */
export function EnumMultiInput(props: FilterValueInputProps): ReactNode {
  const selected = Array.isArray(props.value)
    ? (props.value as string[])
    : [];
  const options = props.field.options ?? [];

  function toggle(v: string) {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    props.onChange(next.length > 0 ? next : undefined);
  }

  return (
    <Stack direction="row" gap="xs" align="center" wrap>
      {options.map((o) => (
        <ToggleChip
          key={o.value}
          active={selected.includes(o.value)}
          variant="ghost"
          size="sm"
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </ToggleChip>
      ))}
    </Stack>
  );
}
