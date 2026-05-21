import { useCallback } from "react";
import { MdDragIndicator, MdClose } from "react-icons/md";
import { cn } from "@/lib/utils";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import type { FieldsRecord, FieldDef } from "@plugins/config_v2/core";
import type { ListItem } from "../../core";

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
          "flex items-start gap-2 rounded-md border border-border bg-card p-2",
          isDragging && "opacity-40",
        )
      }
    >
      {(state) => (
        <>
          <div
            {...state.handleProps}
            className="mt-1 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <MdDragIndicator className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
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
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="mt-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
          >
            <MdClose className="size-3.5" />
          </button>
        </>
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
