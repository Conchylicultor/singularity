import type { FieldDef, FieldType } from "@plugins/config_v2/core";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";

export interface FieldRendererProps<T = unknown> {
  field: FieldDef<T>;
  value: T;
  onChange: (value: T) => void;
}

export interface FieldRendererComponent<T = unknown> {
  (props: FieldRendererProps<T>): React.ReactElement | null;
  type: FieldType<T>;
}

interface FieldRendererEntry {
  component: FieldRendererComponent;
}

const _slot = defineSlot<FieldRendererEntry>("config-v2.fields.renderer", {
  docLabel: (p) => p.component.type.id,
});

function Renderer<T>(component: FieldRendererComponent<T>): Contribution {
  return _slot({ component: component as FieldRendererComponent });
}
Renderer.useContributions = (): FieldRendererEntry[] => _slot.useContributions();
Renderer.id = _slot.id;

export const Fields = { Renderer } as const;
