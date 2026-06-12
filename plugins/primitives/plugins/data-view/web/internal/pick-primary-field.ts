import type { FieldDef } from "../../core";

/**
 * Pick the primary field — the one rendered as the gallery card title and the
 * tree row label. Heuristic: explicit `primary: true` → first `text` field →
 * `fields[0]`. Shared so every view labels rows the same way.
 */
export function pickPrimaryField<TRow>(
  fields: FieldDef<TRow>[],
): FieldDef<TRow> | undefined {
  return (
    fields.find((f) => f.primary === true) ??
    fields.find((f) => f.type === "text") ??
    fields[0]
  );
}
