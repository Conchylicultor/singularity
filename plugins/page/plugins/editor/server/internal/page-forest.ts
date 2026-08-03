import { inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db, currentTxId } from "@plugins/database/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { _blocks } from "./tables";
import { loadPagesBlocks, type BlockRow } from "./forest";
import type { BlockReadExecutor } from "./page-id";

/**
 * Advisory-lock namespace for "structural write to one page's block forest".
 * Arbitrary but fixed: `pg_advisory_xact_lock(classid, objid)` partitions the
 * lock space by `classid`, so this constant keeps our keys from colliding with
 * any other advisory-lock user in the cluster (e.g. the jobs lock).
 */
const PAGE_FOREST_LOCK_CLASS = 0x70616765; // "page"

/**
 * A forest a structural write touches, named by the page that scopes it.
 *
 * `null` is the WORKSPACE ROOT — the sibling space of root pages. It is a forest
 * like any other (`(parent_id, rank)` with `parent_id IS NULL` has its own live
 * unique index) and must serialize like one, so it is a first-class scope rather
 * than a hole a caller can fall through. It is spelled as the row's own
 * `page_id`, so a caller hands over the value it already has and cannot forget
 * to translate it.
 */
export type PageScope = string | null;

/**
 * Lock-key stand-in for the workspace root. A control character keeps it out of
 * the block-id space (ids are `block-<ts>-<rand>` / user-visible page ids), so it
 * can never collide with a real page's key by construction rather than by luck.
 */
const WORKSPACE_ROOT_SCOPE = "\u0000workspace-root";

/**
 * 32-bit FNV-1a over the page id. A hash collision costs only extra
 * serialization between two unrelated pages — never correctness — so a cheap
 * stable hash is the right tool, and computing it HERE (rather than with
 * Postgres' `hashtextextended`) keeps the key independent of an internal catalog
 * function's behaviour across versions.
 */
function pageLockKey(scope: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < scope.length; i++) {
    hash ^= scope.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Postgres' int4 is signed; `| 0` lands the value in range.
  return hash | 0;
}

/**
 * A transaction PROVEN to hold the write lock on the forests it names.
 *
 * The brand is unforgeable: {@link withPageForest} is its only producer, so a
 * handler that opens a bare `db.transaction` holds a `RankExecutor` and every
 * write helper it reaches for fails to compile. That closes the TRANSITIVE half
 * of the guardrail — the direct half (importing `_blocks` and writing it by
 * hand) is closed by the `page-editor/no-adhoc-forest-write` lint rule. Neither
 * is sufficient alone; this is the same pair
 * `database/no-pool-await-in-transaction` names in its own header.
 */
declare const forestTx: unique symbol;
export type PageForestTx = RankExecutor & { readonly [forestTx]: true };

export interface PageForestCtx {
  /** The locked transaction. Every forest write requires it. */
  readonly tx: PageForestTx;
  /**
   * Every LIVE row of the locked pages, loaded under the lock. Memoized, and
   * LAZY — the laziness is what makes "the read happened under the lock" true by
   * CONSTRUCTION: there is no earlier point at which a handler could read. It
   * also means a delete/purge spanning many pages pays for no forest it never
   * reads.
   */
  forest(): Promise<BlockRow[]>;
  /**
   * Work that must NOT hold the lock — re-push, reindex, notify fan-out, the
   * final read-back. Queued here and drained the moment the transaction commits,
   * so it can neither stretch the lock nor await the pool from inside the
   * transaction (`database/no-pool-await-in-transaction`).
   */
  afterCommit(cb: () => void | Promise<void>): void;
}

/**
 * Any drizzle handle that can OPEN a transaction: the global pool handle
 * (production) or a db-test-fixture throwaway DB. A transaction handle is
 * deliberately NOT accepted — `withPageForest` owns its own transaction, and
 * nesting one inside another would take the locks at a savepoint whose rollback
 * would not release them coherently. Same shape, same reason, as
 * `trash-blocks.ts`'s `BlockExecutor`.
 */
export type ForestExecutor = NodePgDatabase;

/**
 * THE structural-write chokepoint: run `fn` against one transaction that holds
 * the write lock on every page forest it names.
 *
 * ## Why the lock exists
 *
 * A structural write is a read-modify-write over the WHOLE forest: load the
 * page's rows, run the pure reducer to get the target tree, diff, and write back
 * the changed rows' columns (`parentId`, `rank`, `type`, `data`, `expanded`).
 * With the read outside the write transaction, two concurrent ops on one page
 * both read the pre-state and the later writer's UPDATE reasserts its stale
 * snapshot over every column — including ones its own op never reasoned about.
 * Captured in the wild as:
 *
 *   indent  BEFORE[aaa<-page  bbb<-page]  AFTER[aaa<-page  bbb<-aaa ]
 *   split   BEFORE[aaa<-page  bbb<-page]  ← read AFTER the indent committed
 *           AFTER[aaa<-page  bbb<-page  ccc<-page]
 *
 * The split only meant to truncate `bbb`'s text, but its row UPDATE carried
 * `parentId` from a pre-indent read and silently un-indented the block. The
 * damage is invisible to the client, which had already predicted both ops
 * correctly — the next authoritative push simply supersedes the indent.
 *
 * This was always possible; a human pausing between Tab and Enter hid it. The
 * caret authority replays a buffered structural keystroke the instant its target
 * mounts, so two ops now leave the client microseconds apart and interleave
 * routinely.
 *
 * `pg_advisory_xact_lock` is TRANSACTION-scoped, so it is released on commit and
 * is safe under PgBouncer's transaction pooling — a session-scoped lock is not.
 *
 * ## Why the order is sorted
 *
 * Multi-page writers exist (a cross-page `move`, a subtree delete spanning
 * sub-pages), and two of them naming the same pair of pages in opposite order
 * would deadlock in Postgres. Acquiring in sorted key order over a deduped set,
 * as the transaction's FIRST statements, makes the wait-for graph acyclic by
 * construction.
 *
 * The watermark is `currentTxId` read INSIDE the transaction, so no handler
 * hand-rolls the ack token the optimistic-mutation primitive compares against.
 *
 * An EMPTY scope list is a transaction with no lock. It is reachable only from
 * the id-derived scope resolvers (`pageScopesOf`) when every named row has
 * already vanished — a state in which the callback provably has nothing to
 * write. Never pass one from a handler that does.
 */
export async function withPageForest<T>(
  scopes: PageScope | PageScope[],
  fn: (ctx: PageForestCtx) => Promise<T>,
  executor: ForestExecutor = db,
): Promise<{ value: T; watermark: string }> {
  const requested = Array.isArray(scopes) ? scopes : [scopes];
  // Deduped and sorted: dedupe because `pg_advisory_xact_lock` is re-entrant but
  // a repeat is pure waste, sorted because that is the deadlock proof.
  const keys = [...new Set(requested.map((s) => s ?? WORKSPACE_ROOT_SCOPE))].sort();
  // Only real pages have rows to load; the workspace-root scope names a sibling
  // space, not a content set.
  const pageIds = [...new Set(requested.filter((s): s is string => s !== null))];

  const queued: Array<() => void | Promise<void>> = [];
  const committed = await executor.transaction(async (tx) => {
    let forest: Promise<BlockRow[]> | undefined;
    const ctx: PageForestCtx = {
      tx: tx as PageForestTx,
      forest: () => (forest ??= loadPagesBlocks(tx, pageIds)),
      afterCommit: (cb) => {
        queued.push(cb);
      },
    };
    for (const key of keys) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${PAGE_FOREST_LOCK_CLASS}::int4, ${pageLockKey(key)}::int4)`,
      );
    }
    const value = await fn(ctx);
    // Ack token: the commit's xid8, read inside the write transaction (Rule A).
    return { value, watermark: await currentTxId(tx) };
  });

  for (const cb of queued) await cb();
  return committed;
}

/**
 * The distinct page scopes a set of block ids lives in — the locks a write over
 * them must hold.
 *
 * Read UNLOCKED on purpose, and that is sound because of what it is FOR: it
 * names which locks to take, never what to write. Everything authoritative is
 * re-read under those locks. A concurrent write that re-scopes a row between
 * this read and the lock would leave the writer holding a lock on the row's
 * former page — strictly narrower than the unlocked window it replaces, and the
 * only alternative (resolving scopes inside the transaction) would have to take
 * locks after a read, giving up the sorted-first-statement deadlock proof.
 */
export async function pageScopesOf(
  executor: BlockReadExecutor,
  blockIds: string[],
): Promise<PageScope[]> {
  if (blockIds.length === 0) return [];
  const rows = await executor
    .selectDistinct({ pageId: _blocks.pageId })
    .from(_blocks)
    .where(inArray(_blocks.id, blockIds));
  return rows.map((r) => r.pageId);
}
