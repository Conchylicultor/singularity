import type { ReactNode } from "react";
import {
  ChipSelectFilterInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";

/** Single-tag select (operand is one tag) for contains / does-not-contain. */
export function TagSingleInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple={false} />;
}

/** Multi-tag select (operand is a string[]) for contains-any-of / contains-all-of. */
export function TagMultiInput(props: FilterValueInputProps): ReactNode {
  return <ChipSelectFilterInput {...props} multiple />;
}
