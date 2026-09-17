import type { ComponentProps, ReactNode } from "react";
import {
  Input,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The text/number operand input shared by every field type's filter value
 * editor. A plain ui-kit `Input`: its height, padding and text follow the
 * ambient control density, so the value cell lines up with the field/operator
 * picker buttons in the same rule row by construction. Centralizing it here
 * means every field type's filter input shares one chrome instead of each
 * hand-rolling a raw `<input>` with ad-hoc width/padding.
 */
export function FilterValueInput(
  props: Omit<ComponentProps<"input">, "size"> & DensityControlled,
): ReactNode {
  return <Input {...props} />;
}
