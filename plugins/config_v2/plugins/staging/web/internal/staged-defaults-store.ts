import { useSyncExternalStore } from "react";
import type { StagedConfigDefault } from "../../core/resources";

/** A staged row's composite identity. */
export interface StagedKey {
  pluginId: string;
  configName: string;
}

/** Dispatches the optimistic upsert + POST for a descriptor's staged default. */
export type StageDispatch = (
  pluginId: string,
  configName: string,
  value: unknown,
) => void;

function keyOf(pluginId: string, configName: string): string {
  return `${pluginId} ${configName}`;
}

// Page-global by design: a single app-wide headless host (a Core.Root
// contribution, mounted exactly once) owns the single optimistic overlay on the
// config-v2 staged-defaults resource and publishes its latest `data` + `dispatch`
// here, so every consumer reads ONE shared pending-ops layer. Mirrors
// edit-mode-store / scope-store (module-level mutable state + listener set +
// useSyncExternalStore read hooks), exactly like reorder's staging store.

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: ONE headless Core.Root host publishes the single staged-defaults optimistic overlay shared by every consumer; there is no per-surface overlay (mirrors edit-mode-store / scope-store).
let rows: StagedConfigDefault[] = [];
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: ONE headless Core.Root host publishes the single staged-defaults optimistic dispatch shared by every consumer; there is no per-surface dispatch (mirrors edit-mode-store / scope-store). Safety default: until the host mounts (it is a Core.Root, so it mounts with everything), dispatching is a no-op rather than a crash.
let dispatch: StageDispatch = () => undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Publish the latest overlay `data` from the headless host. */
export function setStagedDefaultsData(next: StagedConfigDefault[]): void {
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

function useRows(): StagedConfigDefault[] {
  return useSyncExternalStore(
    subscribe,
    () => rows,
    () => rows,
  );
}

/** The optimistic staged value for a descriptor, or undefined when none is staged. */
export function useStagedValue(
  pluginId: string,
  configName: string,
): unknown | undefined {
  const current = useRows();
  const k = keyOf(pluginId, configName);
  const row = current.find((r) => keyOf(r.pluginId, r.configName) === k);
  return row ? row.value : undefined;
}

/** Dispatch the optimistic upsert + POST for a descriptor's staged default. */
export function useStageDefault(): StageDispatch {
  return useSyncExternalStore(
    subscribe,
    () => dispatch,
    () => dispatch,
  );
}

/** True when any descriptor currently has an (uncommitted) staged default. */
export function useHasStagedDefaults(): boolean {
  return useRows().length > 0;
}

/** The composite keys that currently have a staged default. */
export function useStagedKeys(): StagedKey[] {
  return useRows().map((r) => ({ pluginId: r.pluginId, configName: r.configName }));
}
