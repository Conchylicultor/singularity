import { and, eq, isNull } from "drizzle-orm";
import type { ServeAllCollectionOptions } from "@plugins/network/plugins/live/server";
import { PAGE_BLOCK_TYPE, type PageRow } from "../../core/schemas";
import { _blocks } from "./tables";

// How `pagesTree` (core: every live page, key `pages.tree`) binds to the
// database — the ONE spelling both the served collection (`./resources.ts`)
// and the tests (`./pages-tree-oracle.test.ts`, which compiles it against a
// throwaway database and holds it equal to document order) read, so neither
// can drift from what ships.
//
// It reads the `page_blocks` TABLE, never `liveBlocks` (a routed compile reads
// a base table, and `liveBlocks` is a subquery over it): the membership is
// spelled here instead — a page row (`type = 'page'`) that is not trashed
// (`deleted_at IS NULL`, the predicate `liveBlocks` writes for every other
// reader). Both columns are mutable, so a trash is a where-flip exit, a
// restore or a turn-into-page an entrant, and a turn-into-content an exit.
//
// Every row field — the block wire fields and `docRank` — binds to its column
// by name. `doc_rank` is nullable (content rows hold NULL), and on a live page
// row it is always set: invariant I-DR, kept by the structural-write
// chokepoint (`withPageForest` → `doc-rank.ts`) and repaired at boot. The
// binding cannot state that claim — the `all` compiler refuses an `expr` that
// is exactly one column, and a base column's nullability is not checked — so it
// is enforced where it lands: a leaked NULL fails the row schema's
// `RankSchema` at load, loudly, rather than sorting the row anywhere.
//
// So a write to a page row is that row's refill (every column the row reads
// is a field), a `doc_rank` re-mint the refill of exactly the re-minted pages
// (the order is `createdAt`, which never moves), an insert one refill and one
// `orderOf`; a write to a content block — the ~1s `data.text` typing
// projection, a toggle drag — loads nothing, since it is no member and the
// set reads no other row.

export const pageRowsServeOptions = {
  from: _blocks,
  where: and(eq(_blocks.type, PAGE_BLOCK_TYPE), isNull(_blocks.deletedAt))!,
} satisfies ServeAllCollectionOptions<typeof _blocks, PageRow>;
