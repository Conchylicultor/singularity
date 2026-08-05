import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { agentNotesAuthorsResource } from "../../shared/schemas";
import { _pageBlocksAgentAuthors as t } from "./tables";

// Server half of the per-card authorship read, keyed via the shared client
// descriptor (two-arg form) so `keyOf` is declared once and the two runtimes
// cannot drift.
//
// `identityTable` scopes recompute to writes on this table, so a stamp on one
// card never recomputes an unrelated resource. It does NOT deliver a per-row
// scoped refill: the change-feed can only pass affected ids for a
// SINGLE-column primary key, and this table's key is the composite
// `(block_id, conversation_id)` — so a write arrives as FULL-for-table and every
// subscribed card reloads. That is correct, and the right trade: a surrogate id
// column would buy scoped delivery at the price of a meaningless key and a
// separate unique index to make `ON CONFLICT` work, while the recompute it
// avoids is one indexed single-block query over a handful of rows, on a table
// written once per agent note. Hence no `ctx.affectedIds` branch — there is
// never one to serve.
export const agentNotesAuthorsServerResource = defineResource(agentNotesAuthorsResource, {
  identityTable: "page_blocks_agent_authors",
  loader: ({ blockId }) =>
    db
      .select({
        blockId: t.blockId,
        conversationId: t.conversationId,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(eq(t.blockId, blockId))
      .orderBy(asc(t.createdAt)),
});
