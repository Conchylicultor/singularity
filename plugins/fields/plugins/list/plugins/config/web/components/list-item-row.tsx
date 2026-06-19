import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useCallback } from "react";
import { MdDragIndicator, MdClose } from "react-icons/md";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import type { FieldsRecord, FieldDef } from "@plugins/fields/core";
import type { ListItem } from "@plugins/fields/plugins/list/core";

export function ListItemRow<F extends FieldsRecord>({
  item,
  itemFields,
  onChange,
  onRemove,
}: {
  item: ListItem<F>;
  itemFields: F;
  onChange: (updated: ListItem<F>) => void;
  onRemove: () => void;
}) {
  return (
    <SortableItem
      id={item.id}
      handle
      className={({ isDragging }) =>
        cn(
          "rounded-md border border-border bg-card p-sm",
          isDragging && "opacity-40",
        )
      }
    >
      {(state) => (
        <Frame
          align="start"
          gap="sm"
          leading={
            <div
              {...state.handleProps}
              // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align the drag handle with the first sub-field
              className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            >
              <MdDragIndicator className="size-4" />
            </div>
          }
          content={
            <Stack gap="2xs">
              {Object.entries(itemFields).map(([key, field]) => (
                <SubFieldRow
                  key={key}
                  fieldKey={key}
                  field={field}
                  value={(item as Record<string, unknown>)[key]}
                  onChange={(val) =>
                    onChange({ ...item, [key]: val } as ListItem<F>)
                  }
                />
              ))}
            </Stack>
          }
          trailing={
            <button
              type="button"
              onClick={onRemove}
              // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align the remove button with the first sub-field
              className="mt-1 rounded-sm p-2xs text-muted-foreground hover:text-destructive"
            >
              <MdClose className="size-3.5" />
            </button>
          }
        />
      )}
    </SortableItem>
  );
}

function SubFieldRow({
  fieldKey: _fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const handleChange = useCallback(
    (newValue: unknown) => onChange(newValue),
    [onChange],
  );
  return <FieldRenderer field={field} value={value} onChange={handleChange} />;
}
