import type { FieldDef } from "../../core";

/**
 * Pick the leading field — the row's leading visual (its avatar), rendered by
 * list, gallery and tree in the row's leading slot. Only an explicit
 * `leading: true` qualifies: there is no type-based fallback, since data-view
 * names no field type. Throws when more than one field declares it — an
 * authoring mistake, caught on first render rather than resolved by position.
 */
export function pickLeadingField<TRow>(
  fields: FieldDef<TRow>[],
): FieldDef<TRow> | undefined {
  const leading = fields.filter((f) => f.leading === true);
  if (leading.length > 1) {
    throw new Error(
      `data-view: at most one field may declare \`leading: true\`, got ${leading.length} (${leading.map((f) => `"${f.id}"`).join(", ")})`,
    );
  }
  return leading[0];
}
