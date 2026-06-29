import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { FilterGroup, FilterPreset } from "../../core";
import { dataViewDescriptors } from "./descriptors";
import { readFilterPresets } from "./sort-presets";

export interface FilterPresetsController {
  presets: FilterPreset[];
  /** Append a new preset under an explicit stable id. */
  savePreset: (label: string, group: FilterGroup) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, label: string) => void;
}

/** Stable id for a new preset row — mirrors view-core's `newId`, so the
 *  optimistic row and the persisted row share identity across the round-trip. */
function presetId(): string {
  return `preset-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Reads + writes the per-surface saved filter presets, stored as a sibling
 * `filterPresets` key in the SAME `config/<plugin>/<id>.jsonc` doc that backs the
 * view instances (the data-view host injects that field into the views
 * descriptor — view-core never names it). The twin of `useSortPresets`; the
 * descriptor is resolved off the shared `dataViewDescriptors` map by reference
 * identity, exactly as `useViewsConfig` does (throw loud if the id is unknown).
 *
 * Optimistic mirror with a JSON-guarded reconcile effect mirrors
 * `useViewsConfig`, but writes go through **immediately** on each discrete action
 * (no debounce — these are explicit clicks). `filterPresets` is an independent
 * config key, so the server merges it per-key over the freshest base — it never
 * clobbers `views`/`sortPresets` (and vice-versa).
 */
export function useFilterPresets(storageKey: string): FilterPresetsController {
  const descriptor = dataViewDescriptors.get(storageKey);
  if (!descriptor) {
    throw new Error(
      `data-view: no registered descriptor for storageKey "${storageKey}". ` +
        `Declare it (e.g. defineDataView("${storageKey}")) under the plugin's ` +
        `web/ and run \`./singularity build\` to regenerate the manifest.`,
    );
  }

  const config = useConfig(descriptor);
  const setConfig = useSetConfig(descriptor);

  const persisted = useMemo(
    () => readFilterPresets(config.filterPresets),
    [config.filterPresets],
  );

  // Optimistic mirror of the persisted presets.
  const [mirror, setMirror] = useState<FilterPreset[]>(() => persisted);

  // Freshest setConfig for the immediate writes.
  const setConfigRef = useLatestRef(setConfig);

  // True only between an optimistic local mutation and the config catching up,
  // so the reconcile effect doesn't clobber the optimistic value mid-flight.
  const pendingRef = useRef(false);

  // Reconcile the mirror from config when external truth advances and we have no
  // pending local write. JSON identity guards against re-render thrash.
  const persistedJson = JSON.stringify(persisted);
  useEffect(() => {
    if (pendingRef.current) return;
    setMirror((prev) => {
      const incoming = JSON.parse(persistedJson) as FilterPreset[];
      return JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming;
    });
  }, [persistedJson]);

  // `commit` stays referentially stable and writes through the freshest
  // setConfig off the stable `setConfigRef.current`.
  const commit = useCallback((next: FilterPreset[]) => {
    pendingRef.current = true;
    setMirror(next);
    setConfigRef.current("filterPresets", next);
  }, []);

  // The config truth has caught up to (or past) our optimistic write → drop the
  // pending guard so the reconcile effect resumes following external truth.
  useEffect(() => {
    if (JSON.stringify(persisted) === JSON.stringify(mirror)) {
      pendingRef.current = false;
    }
  }, [persisted, mirror]);

  const savePreset = useCallback(
    (label: string, group: FilterGroup) => {
      commit([...mirror, { id: presetId(), label, group }]);
    },
    [commit, mirror],
  );

  const deletePreset = useCallback(
    (id: string) => {
      commit(mirror.filter((p) => p.id !== id));
    },
    [commit, mirror],
  );

  const renamePreset = useCallback(
    (id: string, label: string) => {
      commit(mirror.map((p) => (p.id === id ? { ...p, label } : p)));
    },
    [commit, mirror],
  );

  return useMemo(
    () => ({ presets: mirror, savePreset, deletePreset, renamePreset }),
    [mirror, savePreset, deletePreset, renamePreset],
  );
}
