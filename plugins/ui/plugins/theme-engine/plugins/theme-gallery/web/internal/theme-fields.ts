import type {
  FieldDef,
  FieldOption,
} from "@plugins/primitives/plugins/data-view/web";
import type { ThemeRow } from "./theme-rows";

/**
 * A field's choices, from the values the rows actually carry: most common
 * first, ties alphabetical. The labels are the values themselves — a source or
 * a tag names itself, and the gallery knows none of them in advance.
 */
function optionsOf(values: Iterable<string>): FieldOption[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => ({ value, label: value }));
}

/**
 * The Theme DataView's schema. Every field is a filter, sort and group-by
 * dimension; which ones a card or a row DRAWS is the body's choice, so the
 * dimensions only there to narrow (`catalog`, `saved`) default to hidden.
 */
export function themeFields(rows: readonly ThemeRow[]): FieldDef<ThemeRow>[] {
  return [
    {
      id: "name",
      label: "Name",
      type: "text",
      primary: true,
      value: (r) => r.label,
    },
    {
      id: "source",
      label: "Source",
      type: "enum",
      value: (r) => r.source,
      options: optionsOf(rows.map((r) => r.source)),
    },
    {
      id: "tags",
      label: "Tags",
      type: "tags",
      values: (r) => r.tags,
      options: optionsOf(rows.flatMap((r) => r.tags)),
      sortable: false,
    },
    {
      id: "usedBy",
      label: "Used by",
      type: "tags",
      values: (r) => r.usedBy.map((u) => u.label),
      options: optionsOf(rows.flatMap((r) => r.usedBy.map((u) => u.label))),
      sortable: false,
    },
    {
      id: "catalog",
      label: "Catalog",
      type: "tags",
      values: (r) => r.catalogs,
      options: optionsOf(rows.flatMap((r) => r.catalogs)),
      sortable: false,
      visible: false,
    },
    {
      id: "saved",
      label: "Saved",
      type: "bool",
      value: (r) => r.saved,
      visible: false,
    },
  ];
}

/** What the gallery's search box matches: a theme's name and its tags. */
export function themeSearchText(row: ThemeRow): string {
  return `${row.label} ${row.tags.join(" ")}`;
}
