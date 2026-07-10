import { useCallback, useMemo, type ReactNode } from "react";
import type { ManualOrderConfig } from "@plugins/primitives/plugins/data-view/core";
import type { GlobalRowOrderProps } from "@plugins/primitives/plugins/data-view/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { seedRanks, computeMoveWrites } from "../../core";
import { useRowOrder, useSetRowOrder } from "../internal/use-row-order";

/**
 * Global row-order contribution: turns the persisted `(dataViewId, viewId)` rank
 * rows into the `ManualOrderConfig` the host hands to the active view, so every
 * eligible DataView becomes drag-reorderable with zero per-consumer wiring.
 *
 * The order is a property of the **view instance**, not of the data — two view
 * instances over the same rows hold different orders, which is why `viewId` is
 * part of the key.
 */
export function RowOrderContribution({
  storageKey,
  viewId,
  rowKey,
  rows,
  render,
}: GlobalRowOrderProps): ReactNode {
  const { persisted, pending } = useRowOrder(storageKey, viewId);
  const setRowOrder = useSetRowOrder();

  // `rowKey` is an inline arrow at the consumer's call site (new identity every
  // render). Left raw it would re-key every memo below on every render, and
  // `useDataViewSections` — which memoizes on `manualRank`'s identity — would
  // re-sort the sections forever. `useEventCallback` gives it a stable identity
  // that always dispatches to the latest `rowKey`, so the memos below key on the
  // data (`rows`, `persisted`) rather than on a closure's identity.
  //
  // Deliberately NOT `useLatestRef` (custom-columns' choice): that hands back a
  // ref, and unlike custom-columns — which only *captures* `rowKeyRef` inside
  // lazily-invoked `FieldDef.value` closures — we must call the projection during
  // render to build `orderedKeys`. Reading `ref.current` there is exactly what
  // `react-hooks/refs` forbids.
  const stableRowKey = useEventCallback(rowKey);

  // Always `rowKey(row, 0)`: `FieldDef.value` gets no index, so a surface whose
  // row keys are index-derived cannot persist an order (its keys would shift
  // under the very reorder they encode). Identical documented edge case as
  // custom-columns; every DataView in the repo passes an id-derived `rowKey`.
  const orderedKeys = useMemo(
    () => rows.map((row) => stableRowKey(row, 0)),
    [rows, stableRowKey],
  );

  const rankByKey = useMemo(
    () => seedRanks(orderedKeys, persisted),
    [orderedKeys, persisted],
  );

  const getRank = useCallback(
    (row: unknown): Rank | null =>
      rankByKey.get(stableRowKey(row, 0)) ?? null,
    [rankByKey, stableRowKey],
  );

  const onMove = useCallback(
    (id: string, dest: { targetId?: string; zone?: "before" | "after" }) => {
      // Deliberately ignore `dest.rank`. `RankReorderProvider` computes it
      // against the RENDERED items, which under an active search is a subset of
      // the view's ordered set — a rank between two visible neighbours can land
      // on the wrong side of a hidden row. `computeMoveWrites` re-derives the
      // display order from `orderedKeys` (source order) + `persisted` and mints
      // the ranks itself — the server cannot reproduce seeds, so ranks are
      // client-minted here (precedent: `computeFlatReorder`).
      if (!dest.targetId || !dest.zone) {
        throw new Error(
          "view-order: onMove requires neighbour coordinates (dest.targetId / dest.zone)",
        );
      }
      const writes = computeMoveWrites({
        orderedKeys,
        persisted,
        id,
        targetId: dest.targetId,
        zone: dest.zone,
      });
      if (writes === null) {
        throw new Error(
          `view-order: onMove got a row outside the ordered set (id=${id}, targetId=${dest.targetId})`,
        );
      }
      if (writes.length === 0) return; // legitimate no-op (onto itself / adjacent)
      setRowOrder({ dataViewId: storageKey, viewId, writes });
    },
    [orderedKeys, persisted, setRowOrder, storageKey, viewId],
  );

  const config = useMemo<ManualOrderConfig<unknown>>(
    () => ({ getRank, onMove }),
    [getRank, onMove],
  );

  // Never render a half-order: before the first push `persisted` is empty, so
  // seeding would show pure source order and a drag would persist it as if it
  // were the user's arrangement.
  return <>{render(pending ? null : config)}</>;
}
