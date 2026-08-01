import { sql } from "drizzle-orm";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";

/**
 * Advisory-lock namespace for "structural write to one page's block forest".
 * Arbitrary but fixed: `pg_advisory_xact_lock(classid, objid)` partitions the
 * lock space by `classid`, so this constant keeps our keys from colliding with
 * any other advisory-lock user in the cluster (e.g. the jobs lock).
 */
const PAGE_FOREST_LOCK_CLASS = 0x70616765; // "page"

/**
 * 32-bit FNV-1a over the page id. A hash collision costs only extra
 * serialization between two unrelated pages — never correctness — so a cheap
 * stable hash is the right tool, and computing it HERE (rather than with
 * Postgres' `hashtextextended`) keeps the key independent of an internal catalog
 * function's behaviour across versions.
 */
function pageLockKey(pageId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < pageId.length; i++) {
    hash ^= pageId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Postgres' int4 is signed; `| 0` lands the value in range.
  return hash | 0;
}

/**
 * Serialize structural writes to ONE page's forest.
 *
 * The op handler is a read-modify-write over the WHOLE forest: it loads the
 * page's rows, runs the pure reducer to get the target tree, diffs, and writes
 * back full rows (`parentId`, `rank`, `type`, `data`, `expanded`). With the read
 * outside the write transaction, two concurrent ops on one page both read the
 * pre-state and the later writer's UPDATE reasserts its stale snapshot over
 * every column — including ones its own op never reasoned about. Captured in the
 * wild as:
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
 * `pg_advisory_xact_lock` (TRANSACTION-scoped, so it is released on commit and
 * is safe under PgBouncer's transaction pooling — a session-scoped lock is not)
 * taken as the transaction's FIRST statement, with the load inside the same
 * transaction, makes the read-modify-write atomic per page. Cross-page edits
 * never contend.
 */
export async function lockPageForWrite(tx: RankExecutor, pageId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${PAGE_FOREST_LOCK_CLASS}::int4, ${pageLockKey(pageId)}::int4)`,
  );
}
