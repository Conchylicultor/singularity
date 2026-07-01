/**
 * The Ultimate Guitar source id — the key under which its raw `UgTab` lives in
 * the Sonata context (`rawById`), the `sourceId` of its `Library.Source`
 * contribution, and the opaque `source` discriminator stamped onto the
 * `sonata_songs` row at creation. Lives in `shared/` (not `web/`) so the
 * server-side create route can stamp the same id without a web import. Shared so
 * the source registration, the editor section, and the create route never drift
 * on a string literal.
 */
export const UG_SOURCE_ID = "ultimate-guitar";
