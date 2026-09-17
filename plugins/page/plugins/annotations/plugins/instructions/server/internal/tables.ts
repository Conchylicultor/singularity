import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";

// One row per (conversation, instructions block): "this conversation has
// received this block's instructions, as they read when their markdown hashed
// to `content_hash`". An agent may work under a page only while every
// instructions block in scope has a row here AT ITS CURRENT HASH — an edit to
// the instructions changes the hash, so the old delivery stops counting and the
// next read hands them over again.
//
// Modeled on `page_blocks_agent_authors` (agent-notes/authorship):
//
// - **The composite primary key is the upsert target.** A re-delivery rewrites
//   `content_hash` and `delivered_at` in place (`ON CONFLICT … DO UPDATE`), so
//   two tool calls delivering the same block concurrently cannot insert twice.
// - **`block_id` cascades.** Rows die with the block when it is hard-deleted
//   (`page_blocks` soft-deletes into trash first, so the cascade fires at purge).
// - **`conversation_id` has NO foreign key.** A delivery is a fact about a
//   conversation that may be deleted, and the tool path that writes it takes the
//   conversation id off the MCP route rather than from a conversations row it
//   has read. A dangling id is harmless: nothing reads a delivery except by the
//   conversation asking about itself.
//
// ## Growth bound
//
// One row per block per conversation that worked under it, so the table grows
// with conversations, which the block cascade does not bound. A TTL sweep does
// (`growth-bound.ts`): a swept delivery only means a long-lived conversation is
// handed the same instructions once more on its next read — the failure is a
// repeat, never a skip.
//
// ## No secondary index
//
// Every read is `WHERE conversation_id = ? AND block_id IN (…)`, which the
// primary key (leading with `conversation_id`) serves. The cascade's lookup by
// `block_id` alone is a purge-time cost on a small table.
export const _pageInstructionsDeliveries = pgTable(
  "page_instructions_deliveries",
  {
    conversationId: text("conversation_id").notNull(),
    blockId: text("block_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.blockId] })],
);
