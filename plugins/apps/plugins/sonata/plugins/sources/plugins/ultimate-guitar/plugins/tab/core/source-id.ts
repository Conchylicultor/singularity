/**
 * The Ultimate Guitar source id — the key under which its raw `UgTab` lives in
 * the Sonata context (`rawById`), the `sourceId` of its `Library.Source`
 * contribution, and the opaque `source` discriminator stamped onto the
 * `sonata_songs` row at creation. Lives in this leaf so the UG source (web and
 * server) and the alignment child's sync effect address the same raw without
 * importing each other, and never drift on a string literal.
 */
export const UG_SOURCE_ID = "ultimate-guitar";
