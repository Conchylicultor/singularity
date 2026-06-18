import type { FieldDef, FieldType } from "@plugins/fields/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface FieldRendererProps<T = unknown> {
  field: FieldDef<T>;
  value: T;
  onChange: (value: T) => void;
}

export interface FieldRendererComponent<T = unknown> {
  (props: FieldRendererProps<T>): React.ReactElement | null;
  type: FieldType<T>;
}

const _slot = defineDispatchSlot<FieldRendererProps>(
  "config-v2.fields.renderer",
  {
    key: (props) => props.field.type.id,
    fallback: ({ field }) => (
      <Placeholder>Unknown field type: {field.type.id}</Placeholder>
    ),
    docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
  },
);

function Renderer<T>(component: FieldRendererComponent<T>): Contribution {
  return _slot({
    match: component.type.id,
    component: component as FieldRendererComponent,
  });
}
Renderer.id = _slot.id;
Renderer.Dispatch = _slot.Dispatch;

export const Fields = { Renderer } as const;
