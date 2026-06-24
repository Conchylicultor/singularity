import { Button, Input, cn, SURFACE_LEVELS } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useState } from "react";
import { MdAdd, MdDragIndicator, MdClose } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SortableList,
  SortableItem,
} from "@plugins/primitives/plugins/sortable-list/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { stringListFieldType } from "@plugins/fields/plugins/string-list/core";

const StringListRenderer: FieldRendererComponent<string[]> = ({
  field,
  value,
  onChange,
}) => {
  // `SortableList`/`SortableItem` key rows by a stable string id, but the stored
  // value is a bare `string[]` whose entries can duplicate and mutate freely —
  // so a string can't be its own id. We keep a parallel id array, positionally
  // aligned to `value`, and reconcile it whenever `value`'s length changes
  // underneath us (external edit, reset). Reorder/remove move the id alongside
  // its string, so a row keeps identity across a typing session even as its text
  // changes.
  const [ids, setIds] = useState<string[]>(() =>
    Array.from({ length: value.length }, () => crypto.randomUUID()),
  );
  if (ids.length !== value.length) {
    const next = ids.slice(0, value.length);
    while (next.length < value.length) next.push(crypto.randomUUID());
    setIds(next);
  }

  const handleMove = useCallback(
    (activeId: string, overId: string) => {
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;

      const nextIds = [...ids];
      const [movedId] = nextIds.splice(from, 1);
      nextIds.splice(to, 0, movedId!);

      const nextValue = [...value];
      const [movedVal] = nextValue.splice(from, 1);
      nextValue.splice(to, 0, movedVal!);

      setIds(nextIds);
      onChange(nextValue);
    },
    [ids, value, onChange],
  );

  const handleItemChange = useCallback(
    (index: number, next: string) => {
      if (value[index] === next) return;
      onChange(value.map((v, i) => (i === index ? next : v)));
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      setIds(ids.filter((_, i) => i !== index));
      onChange(value.filter((_, i) => i !== index));
    },
    [ids, value, onChange],
  );

  const handleAdd = useCallback(() => {
    setIds([...ids, crypto.randomUUID()]);
    onChange([...value, ""]);
  }, [ids, value, onChange]);

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
          {value.map((entry, index) => (
            <StringRow
              key={ids[index]}
              id={ids[index]!}
              value={entry}
              placeholder={field.meta.placeholder}
              onChange={(next) => handleItemChange(index, next)}
              onRemove={() => handleRemove(index)}
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
StringListRenderer.type = stringListFieldType;

function StringRow({
  id,
  value,
  placeholder,
  onChange,
  onRemove,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  // Local edit buffer: typing updates `local`; we flush to `onChange` on blur so
  // a controlled re-render mid-keystroke can't fight the cursor. While unfocused
  // the row mirrors the external value (reorder, external edit). `focused` is
  // state (not a ref) so the render-phase value→local sync below reads it without
  // touching a ref during render.
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  if (!focused && local !== value) setLocal(value);

  return (
    <SortableItem
      id={id}
      handle
      className={({ isDragging }) =>
        cn(
          SURFACE_LEVELS.raised,
          "flex items-center gap-sm p-sm",
          isDragging && "opacity-40",
        )
      }
    >
      {(state) => (
        <>
          <div
            {...state.handleProps}
            className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <MdDragIndicator className="size-4" />
          </div>
          <Input
            value={local}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
              setFocused(false);
              onChange(local);
            }}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-sm p-2xs text-muted-foreground hover:text-destructive"
          >
            <MdClose className="size-3.5" />
          </button>
        </>
      )}
    </SortableItem>
  );
}

export { StringListRenderer };
