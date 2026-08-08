/**
 * THE one place a `page_blocks` id comes into existence.
 *
 * A block id is minted in two very different situations — the client mints one
 * BEFORE the round trip (an optimistic op renders the block on the keystroke, so
 * it must already know its identity), and a server handler mints one for a row
 * no editor is open on (the Pages sidebar's "+", an inline page link, the seed
 * child of turn-into-page). Both call this, so the two situations cannot drift
 * into two id FORMATS the way they did before: the server minted
 * `block-<epoch-ms>-<6 base36 chars>` while the client minted a bare
 * `crypto.randomUUID()`, and a page's URL told you which handler had created it.
 *
 * The format is `block-<uuid>`:
 *
 *  - The `block-` prefix makes an id self-describing wherever one travels as
 *    naked text — a URL, a `<agent-note id="…">` attribute, a log line, a DB
 *    row someone is eyeballing.
 *  - The uuid body is collision-free by construction. The old
 *    timestamp-plus-6-random-chars form was not: two blocks minted in the same
 *    millisecond had a real (if small) chance of colliding on the primary key,
 *    and it published its row's creation time inside the id.
 *
 * **Nothing parses this format, and nothing may start.** Rows minted before this
 * function existed keep their bare-uuid ids forever (the column is `text`, and
 * the id is referenced by two self-FKs plus every `page_blocks_ext_*` side
 * table, so a backfill is a migration, not a rename). An id-shaped string is
 * therefore an OPAQUE key: legal to compare, store and route on, never to
 * validate or destructure. Enforcement is upstream instead — the
 * `page-editor/no-adhoc-block-id` lint rule keeps this the only mint.
 */
export function newBlockId(): string {
  return `block-${crypto.randomUUID()}`;
}
