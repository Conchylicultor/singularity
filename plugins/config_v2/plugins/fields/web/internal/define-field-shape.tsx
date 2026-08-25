import type {
  FieldShapeProps,
  FieldShapeRenderer,
} from "@plugins/config_v2/plugins/fields/core";

import { FieldShapeView } from "./field-shape-view";
import type { FieldRendererComponent } from "./slots";

/**
 * Turns a SHAPE renderer into the component the dispatch slot already takes.
 *
 * The slot machinery is unchanged — still `defineDispatchSlot` keyed on
 * `props.field.type.id`. What changed is that the component is GENERATED rather
 * than authored, so the one thing a field type used to be able to do wrong — draw
 * its own label, its own padding, its own row, its own selection indicator — has
 * nowhere left to happen.
 *
 * `FieldRendererComponent` is deliberately NOT exported from this plugin's
 * barrel. Everything a field type needs is here, and a hand-written renderer is
 * therefore a compile error rather than a survivor that quietly keeps drawing
 * its own chrome.
 */
export function defineFieldShape<T>(
  renderer: FieldShapeRenderer<T>,
): FieldRendererComponent<T> {
  const Rendered = (props: FieldShapeProps<T>) => (
    // Called unconditionally, at the top of a real component, so `useShape` may
    // be a hook.
    <FieldShapeView field={props.field} shape={renderer.useShape(props)} />
  );
  Rendered.type = renderer.type;
  return Rendered;
}
