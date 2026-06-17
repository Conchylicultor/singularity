import type { ReactNode } from "react";
import {
  ChipSelectFilterInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";

/** Single-select option (operand is one value) for is / is-not. */
export function EnumSingleInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple={false} />;
}

/** Multi-select options (operand is a string[]) for is-any-of / is-none-of. */
export function EnumMultiInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple />;
}
