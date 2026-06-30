import type { FieldDef } from "../../core";

/**
 * Resolve the BODY field list for a view from the full schema + the view's
 * per-instance `visibleFields` policy. The single shared seam every view uses to
 * decide which fields (and in what order) render in its body — sort/filter/search
 * keep operating on the full `fields`.
 *
 * - `null`/`undefined` (unconfigured) → identity: return `fields` as-is (show-all
 *   default, schema order), so the result is reference-identical to today and the
 *   table/gallery/list render byte-for-byte unchanged.
 * - explicit array → exactly those ids, in that order, resolved via a byId map;
 *   ids the schema no longer carries (e.g. a removed custom column) are dropped.
 */
export function resolveBodyFields<TRow>(
  fields: FieldDef<TRow>[],
  visible: string[] | null | undefined,
): FieldDef<TRow>[] {
  if (visible == null) return fields;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return visible
    .map((id) => byId.get(id))
    .filter((f): f is FieldDef<TRow> => f != null);
}
