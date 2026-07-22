import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { arrayMove } from "@dnd-kit/sortable";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import type { FieldsRecord } from "@plugins/fields/core";
import { listFieldType, type ListItem } from "@plugins/fields/plugins/list/core";
import type { ListFieldDef } from "../../core";
import { ListItemRow } from "./list-item-row";

const ListRenderer: FieldRendererComponent<ListItem<FieldsRecord>[]> = ({
  field,
  value,
  onChange,
}) => {
  const listDef = field as unknown as ListFieldDef;
  const { itemFields } = listDef;

  const ids = useMemo(() => value.map((i) => i.id), [value]);

  // Array position is the canonical order, so a reorder is a plain array splice
  // (no fractional rank to recompute).
  const handleMove = useCallback(
    (activeId: string, overId: string) => {
      const from = value.findIndex((i) => i.id === activeId);
      const to = value.findIndex((i) => i.id === overId);
      if (from === -1 || to === -1) return;
      onChange(arrayMove(value, from, to));
    },
    [value, onChange],
  );

  const handleItemChange = useCallback(
    (updated: ListItem<FieldsRecord>) => {
      onChange(value.map((item) => (item.id === updated.id ? updated : item)));
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter((item) => item.id !== id));
    },
    [value, onChange],
  );

  const handleAdd = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    for (const [key, f] of Object.entries(itemFields)) {
      defaults[key] = f.defaultValue;
    }

    const newItem = {
      id: crypto.randomUUID(),
      ...defaults,
    } as ListItem<FieldsRecord>;

    // Appended at the end — array position is the order.
    onChange([...value, newItem]);
  }, [value, onChange, itemFields]);

  return (
    <Stack gap="sm" className="py-md">
      {field.meta.label ? (
        <Text as="label" variant="label">
          {field.meta.label}
        </Text>
      ) : null}
      {field.meta.description ? (
        <Text as="p" variant="caption" className="text-muted-foreground">
          {field.meta.description}
        </Text>
      ) : null}

      <SortableList items={ids} onMove={handleMove}>
        <Stack gap="xs">
          {value.map((item) => (
            <ListItemRow
              key={item.id}
              item={item}
              itemFields={itemFields}
              onChange={handleItemChange}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </Stack>
      </SortableList>

      <Stack align="start" gap="none">
        <Button variant="ghost" onClick={handleAdd}>
          <MdAdd className="size-3.5" />
          Add item
        </Button>
      </Stack>
    </Stack>
  );
};
ListRenderer.type = listFieldType;

export { ListRenderer };
