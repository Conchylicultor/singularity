import { defineIdKind } from "@plugins/ids/core";

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
 * The kind is declared once, as `blockIdKind` (`plugins/ids`, shape `uuid`):
 * the mint, and the recognition the active-data chip renders a bare
 * `block-…` in assistant prose from. Recognition is the generic body every kind
 * shares, so the retired `block-<epochMillis>-<6>` ids are still recognised.
 *
 * Beyond that recognition, an id-shaped string is an OPAQUE key: legal to
 * compare, store and route on, never to destructure. Undo of a delete re-inserts
 * a row under its ORIGINAL id, so any historical shape can reach an INSERT on a
 * live path. Enforcement of "one mint" is the `page-editor/no-adhoc-block-id`
 * lint rule — the column is not branded, so a type could not do it.
 */
export const blockIdKind = defineIdKind({
  prefix: "block",
  label: "Block",
  shape: "uuid",
});

/** A new `page_blocks` id — `blockIdKind.mint()`, under the editor's long-standing name. */
export function newBlockId(): string {
  return blockIdKind.mint();
}
