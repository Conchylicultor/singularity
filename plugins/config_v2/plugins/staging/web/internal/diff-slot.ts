import { useContext, useMemo } from "react";
import type { ComponentType } from "react";
import {
  defineSlot,
  PluginRuntimeContext,
} from "@plugins/framework/plugins/web-sdk/core";
import type { StagedConfigDefault } from "../../core/resources";

/** Identity passed to a diff renderer's `match` predicate. */
export interface StagedKey {
  pluginId: string;
  configName: string;
}

/** Props every contributed diff renderer receives. */
export interface StagedDiffProps {
  /** The staged row (its `value` is the staged "after" document). */
  row: StagedConfigDefault;
  /** The committed "before" document this staged value would replace. */
  before: unknown;
}

/** A single registered diff renderer. */
export interface StagingDiffRenderer {
  match: (key: StagedKey) => boolean;
  component: ComponentType<StagedDiffProps>;
}

export const Staging = {
  // Pluggable per-config diff renderer registry. A consumer (e.g. reorder)
  // contributes a renderer whose `match` claims the staged keys it owns; the
  // review section picks the first matching renderer, falling back to the
  // generic structural diff when none matches. config_v2/staging never knows any
  // specific config — the diff is contributed via this slot.
  DiffRenderer: defineSlot<StagingDiffRenderer>("config-v2.staging.diff-renderer"),
};

/**
 * Reads the `config-v2.staging.diff-renderer` registry as an ordered list.
 * Mirrors `useReorderNodeTypes` — the sanctioned raw `bySlot` read that keeps
 * the slot barrel free of a back-edge to its readers.
 */
export function useStagingDiffRenderers(): StagingDiffRenderer[] {
  const ctx = useContext(PluginRuntimeContext);
  const raw = ctx?.bySlot.get("config-v2.staging.diff-renderer");
  return useMemo(() => {
    const out: StagingDiffRenderer[] = [];
    for (const c of raw ?? []) {
      const r = c as Partial<StagingDiffRenderer>;
      if (typeof r.match === "function" && r.component) {
        out.push({ match: r.match, component: r.component });
      }
    }
    return out;
  }, [raw]);
}
