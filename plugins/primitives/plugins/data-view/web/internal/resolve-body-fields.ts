import type { FieldDef } from "../../core";

/**
 * Resolve the BODY field list for a view from the full schema + the view's
 * per-instance `visibleFields` policy. The single shared seam every view uses to
 * decide which fields (and in what order) render in its body — sort/filter/search
 * keep operating on the full `fields`.
 *
 * - `null`/`undefined` (unconfigured) → the schema's own default body set: every
 *   field in schema order EXCEPT those declaring `visible: false` (a dimension
 *   that is not printed). Sort / filter / search are unaffected — every view
 *   runs its section pipeline over the full `fields` and calls this only for the
 *   body.
 * - explicit array → exactly those ids, in that order, resolved via a byId map;
 *   ids the schema no longer carries (e.g. a removed custom column) are dropped.
 */
export function resolveBodyFields<TRow>(
  fields: FieldDef<TRow>[],
  visible: string[] | null | undefined,
): FieldDef<TRow>[] {
  if (visible == null) return fields.filter((f) => f.visible !== false);
  const byId = new Map(fields.map((f) => [f.id, f]));
  return visible
    .map((id) => byId.get(id))
    .filter((f): f is FieldDef<TRow> => f != null);
}
