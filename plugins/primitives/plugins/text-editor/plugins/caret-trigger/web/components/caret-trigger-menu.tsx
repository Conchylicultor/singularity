import { FloatingSurface, type FloatingSurfaceProps } from "@plugins/primitives/plugins/floating-surface/web";
import { caretAnchor } from "../internal/caret-anchor";
import type { CaretQuery } from "../internal/use-caret-trigger";

export interface CaretTriggerMenuProps
  extends Pick<FloatingSurfaceProps, "width" | "padding" | "maxHeight" | "children"> {
  /** The `useCaretQuery` handle — supplies the reposition seed, dismissal, and id. */
  caret: CaretQuery;
  /** The surface's visibility — wire the menu's `surfaceOpen`. */
  open: boolean;
}

/**
 * The caret-anchored surface for a trigger menu: `FloatingSurface` bound to the
 * live caret rect, repositioned on each query keystroke, dismissed on
 * outside-press. Each host supplies its own body as `children`.
 *
 * Taking the whole `caret` handle rather than loose `query` / `onDismiss` props
 * means a host cannot wire a different trigger's dismissal into this surface.
 *
 * `data-caret-trigger` makes the arbiter's at-most-one-owner invariant
 * observable from the DOM (`e2e/caret-trigger-wedge.mjs` asserts on it); the
 * `contents` wrapper takes no box, so it cannot perturb the surface's layout.
 */
export function CaretTriggerMenu({ caret, open, children, ...rest }: CaretTriggerMenuProps) {
  return (
    <FloatingSurface
      open={open}
      anchor={caretAnchor()}
      reposition={caret.query}
      onDismiss={caret.dismiss}
      {...rest}
    >
      <div data-caret-trigger={caret.id} className="contents">
        {children}
      </div>
    </FloatingSurface>
  );
}
