import { useCallback, useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import type { FieldsRecord } from "@plugins/config_v2/core";
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

  const sorted = useMemo(
    () =>
      [...value].sort((a, b) =>
        Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
      ),
    [value],
  );

  const ids = useMemo(() => sorted.map((i) => i.id), [sorted]);

  const handleMove = useCallback(
    (activeId: string, overId: string) => {
      const filtered = sorted.filter((i) => i.id !== activeId);
      const overIdx = filtered.findIndex((i) => i.id === overId);
      const prev = overIdx > 0 ? Rank.from(filtered[overIdx - 1]!.rank) : null;
      const next =
        overIdx < filtered.length ? Rank.from(filtered[overIdx]!.rank) : null;
      const newRank = Rank.between(prev, next);

      onChange(
        value.map((item) =>
          item.id === activeId
            ? { ...item, rank: newRank.toString() }
            : item,
        ),
      );
    },
    [sorted, value, onChange],
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
    const lastRank =
      sorted.length > 0
        ? Rank.from(sorted[sorted.length - 1]!.rank)
        : null;

    const defaults: Record<string, unknown> = {};
    for (const [key, f] of Object.entries(itemFields)) {
      defaults[key] = f.defaultValue;
    }

    const newItem = {
      id: crypto.randomUUID(),
      rank: Rank.between(lastRank, null).toString(),
      ...defaults,
    } as ListItem<FieldsRecord>;

    onChange([...value, newItem]);
  }, [sorted, value, onChange, itemFields]);

  return (
    <div className="flex flex-col gap-2 py-3">
      {field.meta.label ? (
        <label className="text-sm font-medium">{field.meta.label}</label>
      ) : null}
      {field.meta.description ? (
        <p className="text-xs text-muted-foreground">
          {field.meta.description}
        </p>
      ) : null}

      <SortableList items={ids} onMove={handleMove}>
        <div className="flex flex-col gap-1.5">
          {sorted.map((item) => (
            <ListItemRow
              key={item.id}
              item={item}
              itemFields={itemFields}
              onChange={handleItemChange}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </div>
      </SortableList>

      <Button
        variant="ghost"
        size="xs"
        onClick={handleAdd}
        className="self-start"
      >
        <MdAdd className="size-3.5" />
        Add item
      </Button>
    </div>
  );
};
ListRenderer.type = listFieldType;

export { ListRenderer };
