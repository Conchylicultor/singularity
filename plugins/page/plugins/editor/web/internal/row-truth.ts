/**
 * What THIS client knows about a block id in server truth — the one fact that
 * decides whether a `data.text` seed may be applied to the block's content doc
 * without waiting for the server (`research/2026-09-09-page-data-based-text-undo-entries-v2.md`
 * §4).
 *
 * The provider used to infer "no stored doc can exist" from "the row is not
 * confirmed": under a hard delete the `page_block_docs` row cascaded away with
 * its block, so an unconfirmed row really did have no doc behind it. Every
 * block delete is now a **trash**: the doc survives on the server, and an
 * optimistically re-created row (undo of a delete) is unconfirmed AND has a
 * doc. A seed pre-applied for it would merge with the surviving doc as a
 * second paragraph. So the fact is DERIVED from what this client has observed,
 * never inferred from a row's confirmation:
 *
 * - `"present"` — the id is in the authoritative rows right now. The doc-init
 *   FK precondition holds; the block's stored doc (if any) is the authority.
 * - `"removed"` — the id was in the authoritative rows at some earlier push and
 *   is not now. A stored doc MAY survive (a trash), so nothing may be seeded
 *   until the subscription answers; a positive "absent" answer licenses the
 *   seed at that moment.
 * - `"unseen"` — this client has never seen the id in server truth: a
 *   client-minted block (split, insert, paste). Nothing can have been stored
 *   for it, so the deterministic seed is applied instantly at `connect()`.
 *
 * The set behind `"removed"` is monotonic (grown from every authoritative push,
 * never shrunk) and per editor instance: what this tab has seen, not what the
 * server holds — which is exactly the question the pre-seed asks.
 */
export type RowTruth = "unseen" | "present" | "removed";
