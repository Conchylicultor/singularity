import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { bytea } from "@plugins/primitives/plugins/collab-doc/server";
import { _blocks } from "@plugins/page/plugins/editor/server";

// One row per text block that has a content CRDT: the compacted
// `Y.encodeStateAsUpdate(doc)` of the block's per-block `Y.Doc` (per-block CRDT
// plan, research/2026-07-07-page-per-block-crdt-plan-b.md — Stage 1).
//
// Content-agnostic by design: the server merges and stores opaque Yjs bytes; it
// never interprets the doc (no runs, no Lexical, no decorator tokens — those
// live in the editor's web runtime, so only a client can build a
// decorator-correct doc). Rows are created exclusively by the first-writer-wins
// `doc-init` endpoint and die with their block via the FK cascade.
//
// Deliberately NOT excluded from the DB change-feed: the `doc-update` UPDATE is
// what pushes `blockContentResource` to the block's subscribers.
export const _pageBlockDocs = pgTable("page_block_docs", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => _blocks.id, { onDelete: "cascade" }),
  /** `Y.encodeStateAsUpdate(doc)` — compacted whole-doc state. */
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
