import type { ComponentProps, ReactNode } from "react";
import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The control-sized text/number operand input shared by every field type's
 * filter value editor. It wraps the ui-kit `Input` but overrides its fixed
 * `h-8` with the `control-sm` density height (read straight from the
 * `--control-height-sm` runtime var), so the value cell lines up pixel-for-pixel
 * with the adjacent `control-sm` field/operator pickers (`Button size="sm"`) and
 * rescales in lockstep with the active density preset. Centralizing it here means
 * every field type's filter input shares one chrome + height instead of each
 * hand-rolling a raw `<input>` with ad-hoc width/padding.
 *
 * `h-(--control-height-sm)` lands in the built-in `h` tailwind-merge group, so it
 * cleanly replaces the Input's baked `h-8` (later-wins, no `!important`) rather
 * than racing it on CSS source order.
 */
export function FilterValueInput({
  className,
  ...props
}: ComponentProps<"input">): ReactNode {
  return (
    <Input
      className={`h-(--control-height-sm) ${className ?? ""}`}
      {...props}
    />
  );
}
