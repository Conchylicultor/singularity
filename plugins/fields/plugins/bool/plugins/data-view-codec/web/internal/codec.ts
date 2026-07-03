import type { ValueCodec } from "@plugins/primitives/plugins/data-view/web";

/**
 * Boolean ↔ text codec for custom columns. Only the literal text `"true"`
 * decodes to `true`; everything else (incl. `""`/absent) is `false`. A native
 * boolean always encodes to `"true"` / `"false"` — so a stored `false` is a real
 * value, not the empty-string-deletes sentinel.
 */
export const boolCodec: ValueCodec = {
  decode: (raw) => raw === "true",
  encode: (v) => (v ? "true" : "false"),
};
