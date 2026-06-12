import type { ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import type { FieldDef, FilterContribution } from "../../core";

export interface FilterBarProps {
  fields: FieldDef<unknown>[];
  filters: Record<string, unknown>;
  setFilter: (fieldId: string, value: unknown) => void;
  resolveFilter: (typeId: string) => FilterContribution | undefined;
}

/**
 * The write-path UI for per-field filters. For every field whose type resolves a
 * `data-view.filter` contribution (honoring the `extends` chain via `resolveFilter`),
 * renders the contribution's `Control` bound to `filters[field.id]` / `setFilter`.
 * Renders nothing when no field resolves a contribution.
 */
export function FilterBar({
  fields,
  filters,
  setFilter,
  resolveFilter,
}: FilterBarProps): ReactNode {
  const groups = fields
    .map((field) => ({
      field,
      contribution: resolveFilter(field.type ?? "text"),
    }))
    .filter(
      (g): g is { field: FieldDef<unknown>; contribution: FilterContribution } =>
        g.contribution !== undefined,
    );

  if (groups.length === 0) return null;

  return (
    <Stack direction="row" wrap align="end" gap="md">
      {groups.map(({ field, contribution }) => {
        const Control = contribution.Control;
        return (
          <Stack key={field.id} gap="xs">
            <Text variant="caption" className="text-muted-foreground">
              {field.label}
            </Text>
            <Control
              value={filters[field.id]}
              onChange={(v) => setFilter(field.id, v)}
              field={field}
            />
          </Stack>
        );
      })}
    </Stack>
  );
}
