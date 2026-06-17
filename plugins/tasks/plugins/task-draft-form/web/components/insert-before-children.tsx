import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export interface ChildEntry {
  id: string;
  title: string;
}

export interface InsertBeforeChildrenProps {
  children: ChildEntry[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

export function InsertBeforeChildren({
  children,
  selectedIds,
  onChange,
  disabled,
}: InsertBeforeChildrenProps) {
  if (children.length === 0) return null;

  const allSelected = children.every((c) => selectedIds.has(c.id));
  const noneSelected = children.every((c) => !selectedIds.has(c.id));

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(children.map((c) => c.id)));
    }
  };

  if (children.length === 1) {
    const child = children[0]!;
    return (
      <Inset x="sm" y="xs">
        <Text as="label" variant="caption" className="flex cursor-pointer items-center gap-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 cursor-pointer"
            checked={selectedIds.has(child.id)}
            disabled={disabled}
            onChange={(e) => toggle(child.id, e.target.checked)}
          />
          <span>
            Insert before{" "}
            <span className="text-foreground" title={child.title}>
              {truncate(child.title, 40)}
            </span>
          </span>
        </Text>
      </Inset>
    );
  }

  return (
    <div className="flex flex-col gap-xs px-sm py-xs">
      <div className="flex items-center justify-between">
        <Text as="span" variant="caption" className="text-muted-foreground">
          Insert before {noneSelected ? "dependents" : `${selectedIds.size} dependent${selectedIds.size === 1 ? "" : "s"}`}
        </Text>
        <button
          type="button"
          disabled={disabled}
          onClick={toggleAll}
          className="text-caption cursor-pointer text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {allSelected ? "None" : "Select all"}
        </button>
      </div>
      <Stack gap="2xs">
        {children.map((child) => (
          <Text
            as="label"
            variant="caption"
            key={child.id}
            className="flex cursor-pointer items-center gap-xs text-muted-foreground"
          >
            <input
              type="checkbox"
              className="h-3 w-3 cursor-pointer"
              checked={selectedIds.has(child.id)}
              disabled={disabled}
              onChange={(e) => toggle(child.id, e.target.checked)}
            />
            <span title={child.title}>{truncate(child.title, 50)}</span>
          </Text>
        ))}
      </Stack>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
