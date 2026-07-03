import { z } from "zod";

/**
 * A user-defined custom column DEFINITION — one row of the per-surface schema
 * stored in config_v2. `id` is the stable join key to the values table (`cc-…`);
 * `type` is an open field-type id (v1 only ever authors `"text"`, but it is read
 * from data, never hardcoded past the "add column" menu, so number/date/checkbox
 * are small follow-ups).
 */
export interface CustomColumnDef {
  id: string;
  label: string;
  type: string;
  /**
   * Opaque per-type add-time config blob (e.g. an enum's option list). Owned by
   * the field type's own code — `custom-columns` passes it through untouched and
   * never inspects its shape.
   */
  config?: unknown;
}

export const CustomColumnDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  config: z.unknown().optional(),
});

/**
 * One persisted custom-column VALUE row for a DataView surface. The full key is
 * `(dataViewId, rowKey, columnId)`; the resource is already scoped to one
 * `dataViewId`, so the live payload carries only the remaining coordinates.
 */
export interface CustomColumnValueRow {
  rowKey: string;
  columnId: string;
  value: string;
}

export const CustomColumnValueRowSchema = z.object({
  rowKey: z.string(),
  columnId: z.string(),
  value: z.string(),
});
