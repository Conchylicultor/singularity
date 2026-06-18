import { useCallback } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  FieldRenderer,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { FieldDef } from "@plugins/fields/core";
import { objectFieldType } from "@plugins/fields/plugins/object/core";
import type { ObjectFieldDef } from "../../core";

const ObjectRenderer: FieldRendererComponent<Record<string, unknown>> = ({
  field,
  value,
  onChange,
}) => {
  const { subFields } = field as unknown as ObjectFieldDef;

  return (
    <Collapsible defaultOpen className="py-xs">
      <CollapsibleTrigger className="gap-sm py-sm">
        <CollapsibleChevron className="size-4 text-muted-foreground" />
        <div className="flex flex-col gap-2xs text-left">
          {field.meta.label ? (
            <Text variant="label">{field.meta.label}</Text>
          ) : null}
          {field.meta.description ? (
            <Text variant="caption" className="text-muted-foreground">
              {field.meta.description}
            </Text>
          ) : null}
        </div>
      </CollapsibleTrigger>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off margin offsets positioning the nested sub-field indent guide */}
      <CollapsibleContent className="ml-2 mt-1 flex flex-col border-l border-border pl-lg">
        {Object.entries(subFields).map(([key, subField]) => (
          <SubFieldSlot
            key={key}
            fieldKey={key}
            field={subField}
            value={(value as Record<string, unknown>)[key]}
            parentValue={value as Record<string, unknown>}
            onChange={onChange}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};
ObjectRenderer.type = objectFieldType;

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
  parentValue: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}) {
  const handleChange = useCallback(
    (newValue: unknown) => {
      onChange({ ...parentValue, [fieldKey]: newValue });
    },
    [fieldKey, parentValue, onChange],
  );

  return <FieldRenderer field={field} value={value} onChange={handleChange} />;
}

export { ObjectRenderer };
