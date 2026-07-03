import type { ValueCodec } from "@plugins/primitives/plugins/data-view/web";

/**
 * Number ↔ text codec for custom columns. Empty/absent text decodes to `null`
 * (an unset cell); a number encodes to its decimal string, `null`/`undefined`
 * to `""` (the empty-string-deletes sentinel).
 */
export const numberCodec: ValueCodec = {
  decode: (raw) => (raw == null || raw === "" ? null : Number(raw)),
  encode: (v) => (v == null ? "" : String(v)),
};
