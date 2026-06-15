import { useSyncExternalStore } from "react";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import type { StagedReorderDefault } from "../../shared/resources";

/** Dispatches the optimistic upsert + POST for a slot's staged default. */
export type StageDispatch = (
  slotId: string,
  pluginId: string,
  items: ReorderTree,
) => void;

// Page-global by design: a single app-wide headless host (a Core.Root
// contribution, mounted exactly once) owns the single optimistic overlay on the
// reorder staged-defaults resource and publishes its latest `data` + `dispatch`
// here, so every reorderable slot and both pen-button hosts read ONE shared
// pending-ops layer. Mirrors edit-mode-store / scope-store (module-level mutable
// state + listener set + useSyncExternalStore read hooks).

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: ONE headless Core.Root host publishes the single staged-defaults optimistic overlay shared by every reorderable slot and both pen-button hosts; there is no per-surface overlay (mirrors edit-mode-store / scope-store).
let rows: StagedReorderDefault[] = [];
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: ONE headless Core.Root host publishes the single staged-defaults optimistic dispatch shared by every reorderable slot and both pen-button hosts; there is no per-surface dispatch (mirrors edit-mode-store / scope-store). Safety default: until the host mounts (it is a Core.Root, so it mounts with everything), dispatching is a no-op rather than a crash.
let dispatch: StageDispatch = () => undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Publish the latest overlay `data` from the headless host. */
export function setStagedDefaultsData(next: StagedReorderDefault[]): void {
  if (rows === next) return;
  rows = next;
  emit();
}

/** Publish the stable optimistic dispatch from the headless host. */
export function setStageDispatch(next: StageDispatch): void {
  if (dispatch === next) return;
  dispatch = next;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function useRows(): StagedReorderDefault[] {
  return useSyncExternalStore(
    subscribe,
    () => rows,
    () => rows,
  );
}

/** The optimistic staged tree for a slot, or undefined when none is staged. */
export function useStagedTree(slotId: string): ReorderTree | undefined {
  const current = useRows();
  const row = current.find((r) => r.slotId === slotId);
  // The wire type keeps `items` loosely typed (`unknown[]`); the staged value is
  // a materialized ReorderTree by construction (it is written via the dispatch).
  return row ? (row.items as ReorderTree) : undefined;
}

/** Dispatch the optimistic upsert + POST for a slot's staged default. */
export function useStageDefault(): StageDispatch {
  return useSyncExternalStore(
    subscribe,
    () => dispatch,
    () => dispatch,
  );
}

/** True when any slot currently has an (uncommitted) staged default. */
export function useHasStagedDefaults(): boolean {
  return useRows().length > 0;
}

/** The slot ids that currently have a staged default. */
export function useStagedSlotIds(): string[] {
  return useRows().map((r) => r.slotId);
}
