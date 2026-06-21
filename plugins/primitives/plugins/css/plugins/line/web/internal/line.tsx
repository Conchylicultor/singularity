import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

export interface LineProps extends React.HTMLAttributes<HTMLElement> {
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Clip/Surface/Row). */
  ref?: React.Ref<HTMLElement>;
  /** Permissive passthrough for the rendered element (onClick, href, type,
   *  disabled, aria-current, …) so interactive line containers — Row — can
   *  forward element-specific props that aren't on `HTMLAttributes`. */
  [key: string]: unknown;
}

/**
 * The single home for the **line-container contract** — the bare half of the
 * single-line guarantee, with no chrome of its own.
 *
 * Whether text wraps is a property of the CONTAINER, not the text (see
 * `SingleLine`/`useSingleLine`). A line container owns two layers that always
 * travel together:
 *
 * - **Structural** — `region-line` (`items-center` + `whitespace-nowrap`) on a
 *   `flex` row stops EVERY descendant — `<Text>`, a raw string, an inline chip —
 *   from wrapping.
 * - **Ambient** — `SingleLineProvider value={true}` is the ellipsis-polish twin
 *   that the `<Text>` leaf reads (`useSingleLine`) to truncate on one line.
 *
 * `Row`, `Bar`, and any bespoke single-line strip (a tab chip, a card header)
 * COMPOSE this instead of re-deriving the `region-line` + provider pair by hand —
 * the recipe lives in exactly one place. `Line` adds NO padding / height / hover /
 * border: it is purely `flex region-line` + the provider, so a consumer layers its
 * own chrome via `className` (and its own `as`/handlers via passthrough).
 *
 * NOT a row-with-chrome (that's `Row`), a toolbar strip (that's `Bar`), or a chip
 * (that's `Badge`) — those compose `Line` and add their chrome. `Badge` stays on
 * `inline-flex` and intentionally doesn't compose `Line` (the inline-level case).
 *
 * Caller `className` composes last.
 */
export function Line({
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: LineProps) {
  return (
    <SingleLineProvider value={true}>
      <As ref={ref} className={cn("flex region-line", className)} {...rest}>
        {children}
      </As>
    </SingleLineProvider>
  );
}
