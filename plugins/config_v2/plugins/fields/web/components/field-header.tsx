import type { FieldDef } from "@plugins/config_v2/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export function FieldHeader({ field }: { field: FieldDef }) {
  return (
    <Stack gap="2xs">
      {field.meta.label ? (
        <Text as="label" variant="label">{field.meta.label}</Text>
      ) : null}
      {field.meta.description ? (
        <Text as="p" variant="caption" tone="muted">
          {field.meta.description}
        </Text>
      ) : null}
    </Stack>
  );
}
