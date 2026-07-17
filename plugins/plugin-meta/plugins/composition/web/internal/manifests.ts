import { useCallback } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";
import {
  compositionsConfig,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";

/**
 * The raw stored composition config items — `{ id, rank, name, entryPoints,
 * selectedContributors }[]` — read reactively from the `compositions` config_v2
 * config. The Studio compositions pane lists + edits these; engine consumers go
 * through {@link useCompositionData} (which maps these to `CompositionManifest[]`).
 */
export function useManifestItems(): CompositionManifestItem[] {
  return useConfig(compositionsConfig).manifests;
}

export interface ManifestActions {
  /**
   * Upsert a manifest. With `editingId` set, replaces that item's `name` /
   * `entryPoints` / `selectedContributors` in place (preserving its `id` +
   * `rank`); otherwise appends a NEW item with a fresh `id` + `rank` (the same
   * generation the `list` field renderer uses — `crypto.randomUUID()` +
   * `Rank.between(lastRank, null)`).
   *
   * Returns the upserted item's `id` — `editingId` when replacing, the freshly
   * minted one when appending. The Studio list pane's "New" creates the row and
   * then navigates to `comp/:id`, so it needs the id the append just minted.
   */
  save(draft: CompositionManifest, editingId?: string): string;
  /** Remove the item with the given `id`. */
  remove(id: string): void;
  /**
   * Flip the `autoBuild` (auto build & serve) flag on the item with the given
   * `id`, preserving every other field. `autoBuild` is engine-opaque config
   * metadata (dropped by `manifestItemToManifest`), so this is a config-only
   * write — the CLI compose-serve stage reads it from MAIN's resolved config.
   */
  setAutoBuild(id: string, on: boolean): void;
}

export function useManifestActions(): ManifestActions {
  const items = useManifestItems();
  const setConfig = useSetConfig(compositionsConfig);

  const save = useCallback(
    (draft: CompositionManifest, editingId?: string) => {
      const fields = {
        name: draft.name,
        // Stored as plain `string[]` (config_v2 string-list). `PluginId` is a
        // branded string, so it widens to `string[]` at the config boundary.
        entryPoints: [...draft.entryPoints] as string[],
        selectedContributors: [...draft.selectedContributors] as string[],
        extends: [...(draft.extends ?? [])],
      };

      const newId = crypto.randomUUID();
      let next: CompositionManifestItem[];
      if (editingId !== undefined) {
        // Spreading the existing item first preserves its `category` (engine-opaque
        // metadata the draft doesn't carry); `fields` overwrites the rest.
        next = items.map((item) =>
          item.id === editingId ? { ...item, ...fields } : item,
        );
      } else {
        // Rank after the current last (rank-sorted, mirroring the list renderer
        // — stored order is not guaranteed rank-ascending).
        const sorted = [...items].sort((a, b) =>
          Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
        );
        const lastRank =
          sorted.length > 0 ? Rank.from(sorted[sorted.length - 1]!.rank) : null;
        const newItem: CompositionManifestItem = {
          id: newId,
          rank: Rank.between(lastRank, null).toString(),
          // New drafts default to the `app` category; re-categorise via config edit.
          category: "app",
          // `excludes` (the self-containment guard) isn't part of the editable
          // draft yet — seed it empty; set it via config edit. The edit path above
          // preserves any existing `excludes` through the `...item` spread.
          excludes: [] as string[],
          // New drafts are not auto-served; activate via the Studio toggle.
          autoBuild: false,
          ...fields,
        };
        next = [...items, newItem];
      }

      setConfig("manifests", next);
      return editingId ?? newId;
    },
    [items, setConfig],
  );

  const remove = useCallback(
    (id: string) => {
      setConfig(
        "manifests",
        items.filter((item) => item.id !== id),
      );
    },
    [items, setConfig],
  );

  const setAutoBuild = useCallback(
    (id: string, on: boolean) => {
      setConfig(
        "manifests",
        items.map((item) =>
          item.id === id ? { ...item, autoBuild: on } : item,
        ),
      );
    },
    [items, setConfig],
  );

  return { save, remove, setAutoBuild };
}
