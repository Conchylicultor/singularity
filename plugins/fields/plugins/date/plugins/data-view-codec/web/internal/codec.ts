import type { FieldValue, ValueCodec } from "@plugins/primitives/plugins/data-view/web";

/**
 * Date ↔ text codec for custom columns. Text decodes to a native `Date` (empty/
 * absent → `null`); a `Date` (or a date-coercible string) encodes to a canonical
 * ISO string. An invalid/unparseable date encodes to `""` (the empty-string-
 * deletes sentinel) rather than throwing. The read twin of the server-side date
 * `::timestamptz` text cast.
 */
export const dateCodec: ValueCodec = {
  decode: (raw) => (raw ? new Date(raw) : null),
  encode: (v: FieldValue) => {
    if (v == null || v === "") return "";
    const d = v instanceof Date ? v : new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  },
};
