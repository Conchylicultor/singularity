import { db } from "@plugins/database/server";
import { docOrderRows } from "./page-doc-order";
import { markDocOrderDirty } from "./doc-order-dirty";
import { planPartitionDocRanks, reconcileDocRanks } from "./doc-rank";
import {
  withPageForest,
  type ForestExecutor,
  type PageScope,
} from "./page-forest";

/** What the boot reconcile found. */
export type BootDocRankOutcome =
  /** Every group already satisfied I-DR. */
  | { kind: "clean" }
  /**
   * The database's first boot with the column: no live page held a key yet, so
   * every group was minted from scratch. Expected once per database (main and
   * each fork), and silent.
   */
  | { kind: "backfill"; written: number }
  /**
   * The column was already maintained, and still some group disagreed with
   * document order — a writer changed a placement without going through the
   * marking mutators (or an old backend wrote during a hot-swap). Repaired, and
   * the caller files a report: it is a bug to find, not a state to absorb.
   */
  | {
      kind: "drift";
      written: number;
      /** Rows that HAD a key which no longer fit, vs rows that had none. */
      rekeyed: number;
      unkeyed: number;
      partitions: PageScope[];
    };

/**
 * Bring every sidebar group to invariant I-DR at boot — the `onReadyBlocking`
 * barrier, after `database`'s migrations, so it completes before the gateway
 * hot-swaps traffic onto this backend.
 *
 * Plans against the GLOBAL `docOrderRows()` (about one row per page), then
 * writes through the ordinary path: one `withPageForest` over exactly the
 * groups that need a change, each marked dirty, so the re-mint happens under
 * those groups' locks and is re-planned against what is committed there — a
 * writer racing the boot cannot be overwritten by this read's stale plan.
 * Idempotent: a second run finds nothing to change.
 *
 * Backfill vs drift is decided from the state BEFORE the write: no live page
 * holding a key means the column was never populated (the first boot of this
 * database); otherwise any change is drift.
 */
export async function reconcileDocRanksAtBoot(
  executor: ForestExecutor = db,
): Promise<BootDocRankOutcome> {
  const rows = await docOrderRows(executor);
  const planned = planPartitionDocRanks(rows);
  if (planned.length === 0) return { kind: "clean" };

  const partitions = [...new Set(planned.map((c) => c.pageId))];
  const { value: written } = await withPageForest(
    partitions,
    async (ctx) => {
      markDocOrderDirty(ctx.tx, partitions);
      return reconcileDocRanks(ctx.tx);
    },
    executor,
  );

  if (rows.every((r) => r.docRank === null)) {
    return { kind: "backfill", written: written.length };
  }
  return {
    kind: "drift",
    written: written.length,
    rekeyed: written.filter((c) => c.from !== null).length,
    unkeyed: written.filter((c) => c.from === null).length,
    partitions,
  };
}
