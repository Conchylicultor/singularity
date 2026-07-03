import type { ReactNode } from "react";
import {
  ChipSelectFilterInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";

/**
 * `ChipSelectFilterInput` lists `field.options`, but a custom column carries its
 * enum options on `field.config.options` (not `field.options`). Resolve the same
 * fallback here and inject it onto `field` so the shared input never has to know
 * about the custom-column config shape — see fields/enum column-config.
 */
function withEnumOptions(props: FilterValueInputProps): FilterValueInputProps {
  const options =
    props.field.options ??
    (props.field.config as { options?: { value: string; label: string }[] } | undefined)
      ?.options ??
    [];
  return { ...props, field: { ...props.field, options } };
}

/** Single-select option (operand is one value) for is / is-not. */
export function EnumSingleInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...withEnumOptions(props)} multiple={false} />;
}

/** Multi-select options (operand is a string[]) for is-any-of / is-none-of. */
export function EnumMultiInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...withEnumOptions(props)} multiple />;
}
