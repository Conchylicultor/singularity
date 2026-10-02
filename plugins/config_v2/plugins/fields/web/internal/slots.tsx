import type { FieldDef, FieldType } from "@plugins/fields/core";
import {
  defineSlot,
  defineSlotFacade,
  type Contribution,
} from "@plugins/framework/plugins/web-sdk/core";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { FieldSample } from "../../core";

export interface FieldRendererProps<T = unknown> {
  field: FieldDef<T>;
  value: T;
  onChange: (value: T) => void;
}

export interface FieldRendererComponent<T = unknown> {
  (props: FieldRendererProps<T>): React.ReactElement | null;
  type: FieldType<T>;
}

/**
 * The renderer dispatch slot itself. Exported (not just wrapped by `Fields.Renderer`)
 * because the plugin declares the slots it owns in its `slots` record, and
 * `Renderer` is a typed contribution helper — not a slot object.
 */
export const fieldRendererSlot = defineDispatchSlot<FieldRendererProps>({
  key: (props) => props.field.type.id,
  fallback: ({ field }) => (
    <Placeholder>Unknown field type: {field.type.id}</Placeholder>
  ),
  docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
});

function renderer<T>(component: FieldRendererComponent<T>): Contribution {
  return fieldRendererSlot({
    match: component.type.id,
    component: component as FieldRendererComponent,
  });
}
const Renderer = defineSlotFacade(renderer, fieldRendererSlot);

/**
 * The sample collection slot: each field type with a renderer contributes ONE
 * fixed {@link FieldSample} next to its `Fields.Renderer`, so a surface that
 * shows every field type (the `config/field-gallery` specimen) reads them
 * generically, naming none. Read through `useFieldSamples`.
 */
export const fieldSampleSlot = defineSlot<FieldSample>({
  docLabel: (s) => s.field.type.id,
});

function sample<T>(s: FieldSample<T>): Contribution {
  // A sample's value is checked against its own field by `fieldSample`; the
  // slot holds the open set, so it is stored at the erased `FieldSample`.
  return fieldSampleSlot(s as FieldSample);
}
const Sample = defineSlotFacade(sample, fieldSampleSlot);

export const Fields = { Renderer, Sample } as const;
