/**
 * The Ultimate Guitar source id — the key under which its raw `UgTab` lives in
 * the Sonata context (`rawById`). Shared so the source registration and the
 * editor section never drift on a string literal. (The library `Library.Source`
 * `sourceId` will reuse this once persistence lands — a later task.)
 */
export const UG_SOURCE_ID = "ultimate-guitar";
