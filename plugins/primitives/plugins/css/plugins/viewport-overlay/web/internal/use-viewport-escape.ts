import { useLayoutEffect, type RefObject } from "react";
import {
  assertViewportEscape,
  type ViewportEscapeOptions,
} from "./viewport-escape";

/**
 * The React seam over {@link assertViewportEscape}: audit the ancestor chain of
 * a ref'd element the moment a viewport-relative box starts mattering.
 *
 * A LAYOUT effect, not an effect: the chain is read before the browser paints,
 * so in dev the throw arrives instead of the wrong-looking frame rather than
 * after it.
 *
 * `enabled` is the activation — pass the same condition that turns the
 * viewport-relative box on (`viewportRelative`, `import.meta.env.DEV`). A false
 * `enabled`, or a ref that has not attached yet, is a silent no-op; there is
 * deliberately no non-null assertion at the call site, because "the element is
 * not there" is a legitimate state and not a fault to report.
 *
 * The deps are the ACTIVATION, not the render. Re-walking the chain on every
 * render would re-throw the same fault every frame (and in prod re-emit the same
 * report), so the effect re-runs only when what it is auditing changes: the
 * enablement, and the caller's wording. Those are string literals at every call
 * site, so in practice this runs once per activation.
 */
export function useViewportEscape(
  ref: RefObject<Element | null>,
  options: ViewportEscapeOptions & { enabled?: boolean },
): void {
  const { subject, remedy, from, enabled = true } = options;
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    assertViewportEscape(el, { subject, remedy, from });
  }, [ref, subject, remedy, from, enabled]);
}
