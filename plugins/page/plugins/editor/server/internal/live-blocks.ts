import { isNull } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { _blocks } from "./tables";

/**
 * The LIVE blocks relation — `page_blocks` with the trashed rows already gone.
 *
 * Every block delete is a trash: the row stays, flagged `deleted_at` (see
 * `tables.ts` / `trash-blocks.ts`). So every ordinary reader of the table —
 * the live resources, the sidebar, the reindexers, the markdown read, a
 * handler resolving an id — must exclude those rows, and a reader that forgets
 * the predicate resurrects trashed content into a surface the user cannot
 * explain. This relation removes the predicate from every reader's spelling:
 * `.from(liveBlocks)` cannot forget `WHERE deleted_at IS NULL` because it never
 * writes it. Readers of `_blocks` itself are limited to the trash machinery by
 * `page-editor/no-unfiltered-blocks-read`.
 *
 * A drizzle SUBQUERY, deliberately, and not a DB view:
 *
 * - The rendered SQL still names the base table — `from (select … from
 *   "page_blocks" where …) "live_blocks"` — so the live-state read-set
 *   extractor (`database/server/internal/client.ts`, which matches
 *   `from|join "<table>"` by regex) and the change-feed invalidation keep
 *   seeing `page_blocks`. A view would hide it, and every resource reading
 *   through the view would silently stop refreshing.
 * - Postgres flattens a subquery this simple into the outer query, so the
 *   plan is the base table's own (index and all); there is nothing to migrate.
 * - Built on `QueryBuilder`, not `db`, so this module evaluates without a
 *   connection and the db-fixture tests can read through it against a
 *   throwaway database.
 *
 * Typed exactly like `_blocks`: `liveBlocks.<col>` is the same column, decoder
 * included (`rank_text`, `parsedJson` — `live-blocks.test.ts` proves both
 * survive the alias), so `select().from(liveBlocks)` infers the same row.
 */
export const liveBlocks = new QueryBuilder()
  .select()
  .from(_blocks)
  .where(isNull(_blocks.deletedAt))
  .as("live_blocks");
