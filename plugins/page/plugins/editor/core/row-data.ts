/**
 * Row data minus the projection-owned `text` key — what a row-writing API
 * accepts.
 *
 * A block's text has exactly ONE owner: its per-block `Y.Doc`.
 * `page_blocks.data.text` is a ~1 s-debounced PROJECTION of that doc, with one
 * writer (`projectText`) and one reader (the doc-init seed). An *edit* to an
 * existing block therefore has nothing to say about `text` — and
 * `{ text?: never }` turns saying it into a compile error while leaving
 * text-free payloads untouched.
 *
 * Row text IS writable at block CREATION — a brand-new id has no doc, so its
 * row is that doc's only seed — which is why `insertAfter` / `BlockOp.insert.
 * data` / `split.tailData` deliberately keep accepting text.
 */
export type RowData = Record<string, unknown> & { text?: never };

/**
 * A stored `data` blob narrowed to what a row write may restate: everything
 * EXCEPT `text`.
 *
 * `BlockEditorAPI.update` REPLACES the whole blob, so a control that changes one
 * field must restate the block's other fields — but restating the row's `text`
 * writes a snapshot that lags the content doc by up to the projection debounce,
 * i.e. it can drop text the user typed in the last second. This is the sanctioned
 * way to spread a block's existing data: `update({ ...rowDataOf(block.data), color })`.
 */
/**
 * Does this stored blob CARRY a `text` key?
 *
 * The presence reader beside the stripper, and deliberately not
 * `runsOf(data.text).length > 0`: absent and empty are DIFFERENT facts at the
 * write boundary — a void type's strict schema rejects the key's presence, a
 * text-bearing type's rejects its absence, and `[]` is a legitimate value for
 * the latter. The row-write funnel's conform asks exactly this question, and
 * asking it here is what keeps it from reaching for a cast on the branded blob.
 */
export function hasTextKey(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === "object" &&
    Object.prototype.hasOwnProperty.call(data, "text")
  );
}

export function rowDataOf(data: unknown): RowData {
  const record = data as Record<string, unknown> | null | undefined;
  const { text: _text, ...rest } = record ?? {};
  // `rest` still carries `Record<string, unknown>`'s index signature (which
  // subsumes `text`); the cast asserts what the destructure just removed.
  return rest as RowData;
}
