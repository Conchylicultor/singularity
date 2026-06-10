import type { FieldDef } from "@plugins/config_v2/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export function FieldHeader({ field }: { field: FieldDef }) {
  return (
    <div className="flex flex-col gap-0.5">
      {field.meta.label ? (
        <Text as="label" variant="label">{field.meta.label}</Text>
      ) : null}
      {field.meta.description ? (
        <Text as="p" variant="caption" tone="muted">
          {field.meta.description}
        </Text>
      ) : null}
    </div>
  );
}
