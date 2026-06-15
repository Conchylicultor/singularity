import { useCallback, useEffect } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import { stageReorderDefault } from "../../core/endpoints";
import {
  stagedReorderDefaultsResource,
  type StagedReorderDefault,
} from "../../shared/resources";
import { setStageDispatch, setStagedDefaultsData } from "./staged-defaults-store";

// Variables for one optimistic stage op — the materialized tree for a slot.
interface StageVars {
  slotId: string;
  pluginId: string;
  items: ReorderTree;
}

// The staged `items` tree is plain JSON (strings + structural objects), so a
// stable stringify comparison is the simplest correct structural equality. No
// shared deepEqual util exists in the repo; a heavier dependency is unwarranted
// for confirming a small, already-normalized tree.
function itemsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Last-write-wins upsert by slotId, mirroring the DB primary key. Keep the array
// sorted by slotId to match the server loader's `orderBy(asc(slotId))` so the
// optimistic base and the authoritative push render in the same order.
function upsertRow(
  rows: StagedReorderDefault[],
  vars: StageVars,
): StagedReorderDefault[] {
  const next: StagedReorderDefault = {
    slotId: vars.slotId,
    pluginId: vars.pluginId,
    items: vars.items,
    authorId: null,
    updatedAt: new Date(),
  };
  const without = rows.filter((r) => r.slotId !== vars.slotId);
  return [...without, next].sort((a, b) => a.slotId.localeCompare(b.slotId));
}

/**
 * Headless `Core.Root` host that owns the single optimistic overlay on
 * `stagedReorderDefaultsResource`, shared by every reorderable slot AND both
 * pen-button hosts. Because `Core.Root` renders exactly once app-wide, this is
 * the single instance that keeps all pending stage ops in one ordered layer
 * (concurrent slot edits on the same resource cache key never race). It lives
 * inside `NotificationsProvider` (the `Core.Root` tree is under it in the
 * bootstrap `App.tsx`), so the live-state read works.
 *
 * It publishes the overlay's latest `data` + a stable `dispatch` wrapper into
 * the module store (`staged-defaults-store`); the exported read hooks consume
 * the store, so no React context / app-root provider mount is needed.
 */
export function StagedDefaultsOverlayHost() {
  const { data, dispatch } = useOptimisticResource<StagedReorderDefault[], StageVars>({
    resource: stagedReorderDefaultsResource,
    apply: upsertRow,
    mutate: (vars) =>
      fetchEndpoint(
        stageReorderDefault,
        {},
        { body: { slotId: vars.slotId, pluginId: vars.pluginId, items: vars.items } },
      ).then(() => undefined),
    isConfirmedBy: (rows, vars) =>
      rows.some((r) => r.slotId === vars.slotId && itemsEqual(r.items, vars.items)),
  });

  const stage = useCallback(
    (slotId: string, pluginId: string, items: ReorderTree) => {
      dispatch({ slotId, pluginId, items });
    },
    [dispatch],
  );

  // Bridge the React-state overlay output into the module store so cross-mount
  // consumers (slots, pen buttons) read it without a context provider. This is
  // the sanctioned headless-host → module-store publish pattern.
  useEffect(() => {
    setStagedDefaultsData(data);
  }, [data]);

  useEffect(() => {
    setStageDispatch(stage);
  }, [stage]);

  return null;
}
