import type { ReactNode } from "react";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";

/** Single-tag select chips (operand is one tag) for contains / does-not-contain. */
export function TagSingleInput(props: FilterValueInputProps): ReactNode {
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

/** Multi-tag chips (operand is a string[]) for contains-any-of / contains-all-of. */
export function TagMultiInput(props: FilterValueInputProps): ReactNode {
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
