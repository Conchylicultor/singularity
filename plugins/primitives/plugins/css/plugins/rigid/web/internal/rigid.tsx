import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * The pure rigid class — single source of truth, exported so the component and
 * the pure test share one definition.
 *
 * **No axis parameter, and that asymmetry with `fillClasses(axis)` is
 * deliberate — do not "fix" it.** `Fill` needs an axis because its two halves
 * are two DIFFERENT CSS properties (`min-width:0` vs `min-height:0`), only one
 * of which is right for a given container. `flex-shrink` is ONE property that
 * already applies along whichever axis the container declared as its main axis,
 * so an axis argument here could only ever be ignored — or, worse, be believed.
 */
export function rigidClass(): string {
  return "shrink-0";
}

export interface RigidProps extends React.HTMLAttributes<HTMLElement> {
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Clip/Fill/Pin). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The rigid flex child — a leaf that keeps its size while its siblings absorb
 * the pressure. The missing half of `<Fill>`: `Fill` owns `min-w-0 flex-1` (the
 * cell that gives), `Rigid` owns `shrink-0` (the cell that doesn't), and 38 call
 * sites wrote the latter by hand because nothing named it.
 *
 * **`rigidClass()` is the default answer**, not this component. 34 of those
 * sites already sit on an element the author owns and styles (`w-40 shrink-0
 * truncate font-mono …`), so wrapping them in a `<Rigid>` would add a box that
 * does nothing but hold one class. Take the class; keep the element.
 * `<Rigid>` is for the two remaining shapes: the rigid **spacer** with no
 * content of its own (`<Rigid className="w-16" />`), and a rigid wrapper around
 * children you cannot otherwise reach.
 *
 * Rigidity belongs to a leaf that TRAVELS — "must not shrink inside whatever
 * flex row hosts me" is knowledge the leaf has and its container does not. A
 * named-slot container owns rigidity for its OWN slots instead (`<Column>`
 * already makes its header/footer rigid); nothing here changes that.
 *
 * Caller `className` composes last.
 */
export function Rigid({
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: RigidProps) {
  return (
    <As ref={ref} className={cn(rigidClass(), className)} {...rest}>
      {children}
    </As>
  );
}
