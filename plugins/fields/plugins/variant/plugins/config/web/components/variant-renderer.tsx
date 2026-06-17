import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/ui-kit/web";
import {
  FieldHeader,
  FieldRenderer,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import type { FieldDef } from "@plugins/config_v2/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import {
  variantFieldType,
  type VariantValue,
} from "@plugins/fields/plugins/variant/core";
import type { VariantFieldDef } from "../../core";

// Minimal (ST3) type-dispatched renderer for a variant field. A type selector
// sets `value.type`; when the selected type is in the injected `useVariants`
// registry, its payload sub-fields recurse through `FieldRenderer` (each reading
// /writing one `value[subKey]`), exactly like the object renderer. With no
// registry in this render context it degrades to a read-only display of the
// current `type`. The rich switcher UI is a later sub-task (ST4).
const VariantRenderer: FieldRendererComponent<VariantValue> = ({
  field,
  value,
  onChange,
}) => {
  const variants = (field as VariantFieldDef).useVariants?.();

  const onSelectType = useCallback(
    (type: string | null) => onChange({ type: type ?? "" }),
    [onChange],
  );

  if (!variants) {
    // No registry here — degrade gracefully, never crash.
    return (
      <Stack gap="xs" className="py-md">
        <FieldHeader field={field} />
        <Text variant="body" tone="muted" className="font-mono">
          {value.type || "(no type)"}
        </Text>
        <Text variant="caption" tone="muted">
          No variant registry available in this context.
        </Text>
      </Stack>
    );
  }

  const entry = variants.get(value.type);

  return (
    <Stack gap="xs" className="py-md">
      <FieldHeader field={field} />
      <Select value={value.type || undefined} onValueChange={onSelectType}>
        <SelectTrigger>
          <SelectValue placeholder="Select a type…" />
        </SelectTrigger>
        <SelectContent>
          {Array.from(variants.entries()).map(([type, e]) => (
            <SelectItem key={type} value={type}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {entry ? (
        <Stack gap="2xs">
          {Object.entries(entry.fields).map(([key, subField]) => (
            <SubFieldSlot
              key={key}
              fieldKey={key}
              field={subField}
              value={value[key]}
              parentValue={value}
              onChange={onChange}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};
VariantRenderer.type = variantFieldType;

function SubFieldSlot({
  fieldKey,
  field,
  value,
  parentValue,
  onChange,
}: {
  fieldKey: string;
  field: FieldDef;
  value: unknown;
  parentValue: VariantValue;
  onChange: (updated: VariantValue) => void;
}) {
  const handleChange = useCallback(
    (newValue: unknown) => {
      onChange({ ...parentValue, [fieldKey]: newValue });
    },
    [fieldKey, parentValue, onChange],
  );

  return <FieldRenderer field={field} value={value} onChange={handleChange} />;
}

export { VariantRenderer };
