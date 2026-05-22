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
import type { FieldDef } from "@plugins/config_v2/core";
import { objectFieldType, type ObjectFieldDef } from "../../core";

const ObjectRenderer: FieldRendererComponent<Record<string, unknown>> = ({
  field,
  value,
  onChange,
}) => {
  const { subFields } = field as unknown as ObjectFieldDef;

  return (
    <Collapsible defaultOpen className="py-1">
      <CollapsibleTrigger className="gap-2 py-2">
        <CollapsibleChevron className="size-4 text-muted-foreground" />
        <div className="flex flex-col gap-0.5 text-left">
          {field.meta.label ? (
            <span className="text-sm font-medium">{field.meta.label}</span>
          ) : null}
          {field.meta.description ? (
            <span className="text-xs text-muted-foreground">
              {field.meta.description}
            </span>
          ) : null}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 mt-1 flex flex-col border-l border-border pl-4">
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
