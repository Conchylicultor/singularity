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
        <Text as="label" variant="caption" className="cursor-pointer text-muted-foreground">
          <Stack direction="row" align="center" gap="xs">
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
          </Stack>
        </Text>
      </Inset>
    );
  }

  return (
    <Inset x="sm" y="xs">
      <Stack gap="xs">
        <Stack direction="row" align="center" justify="between" gap="sm">
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
        </Stack>
        <Stack gap="2xs">
          {children.map((child) => (
            <Text
              as="label"
              variant="caption"
              key={child.id}
              className="cursor-pointer text-muted-foreground"
            >
              <Stack direction="row" align="center" gap="xs">
                <input
                  type="checkbox"
                  className="h-3 w-3 cursor-pointer"
                  checked={selectedIds.has(child.id)}
                  disabled={disabled}
                  onChange={(e) => toggle(child.id, e.target.checked)}
                />
                <span title={child.title}>{truncate(child.title, 50)}</span>
              </Stack>
            </Text>
          ))}
        </Stack>
      </Stack>
    </Inset>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
