import type { ReactNode } from "react";
import {
  ChipSelectFilterInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";

/**
 * `ChipSelectFilterInput` lists `field.options`, which is authoritative for every
 * enum field, custom column included — a custom column's private `config.options`
 * is projected onto it by this type's `ColumnConfig.derive` (see fields/enum
 * column-config), so nothing here has to know that shape.
 */

/** Single-select option (operand is one value) for is / is-not. */
export function EnumSingleInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple={false} />;
}

/** Multi-select options (operand is a string[]) for is-any-of / is-none-of. */
export function EnumMultiInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple />;
}
